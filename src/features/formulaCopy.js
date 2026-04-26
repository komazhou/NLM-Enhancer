/**
 * NotebookLM++ 公式点击复制模块
 * 点击页面中渲染的数学公式，按用户选择的格式复制到剪贴板
 * 支持格式：LaTeX ($...$)、MathML (Word)、纯文本 (无$)、Notion ($$...$$)
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.FormulaCopy = (() => {
  const LOG = '[NLM++ FormulaCopy]';
  let currentFormat = 'latex';
  let isInitialized = false;

  const I18N = {
    copied: '✓ 公式已复制',
    failed: '✗ 复制失败',
    noLatex: '✗ 无法提取源码',
  };

  function findMathElement(target) {
    const selectors = ['.katex', '.katex-display', '[data-math]', 'mjx-container', '.MathJax', '.math-inline', '.math-block'];
    for (const sel of selectors) {
      const found = target.closest(sel);
      if (found) return found;
    }
    return null;
  }

  // 【核心重构】：纯 HTML DOM 逆向重组引擎，彻底解决红钻乱码与结构错位
  function extractVisibleMathText(katexHtmlEl) {
    const parts = [];

    function walk(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        if (text && text.trim()) {
          const symbolMap = {
            '\u2212': '-', '−': '-', '\u22c5': '\\cdot ', '⋅': '\\cdot ',
            '\u2217': '*', '∗': '*', '\u00d7': '\\times ', '×': '\\times ',
            '\u00f7': '\\div ', '÷': '\\div ', '\u00b1': '\\pm ', '±': '\\pm ',
            '\u2264': '\\leq ', '≤': '\\leq ', '\u2265': '\\geq ', '≥': '\\geq ',
            '\u2260': '\\neq ', '≠': '\\neq ', '\u2248': '\\approx ', '≈': '\\approx ',
            '\u221e': '\\infty ', '∞': '\\infty ', '\u2202': '\\partial ', '∂': '\\partial ',
            '\u2206': '\\Delta ', 'Δ': '\\Delta ', '\u03b1': '\\alpha ', 'α': '\\alpha ',
            '\u03b2': '\\beta ', 'β': '\\beta ', '\u03b3': '\\gamma ', 'γ': '\\gamma ',
            '\u03c0': '\\pi ', 'π': '\\pi ', '\u03c3': '\\sigma ', 'σ': '\\sigma ',
            '\u03bc': '\\mu ', 'μ': '\\mu ', '\u03c9': '\\omega ', 'ω': '\\omega ',
            '\u03a9': '\\Omega ', 'Ω': '\\Omega ', '\u2192': '\\rightarrow ', '→': '\\rightarrow ',
            '\u222b': '\\int ', '∫': '\\int ', '\u2211': '\\sum ', '∑': '\\sum ',
            '\u220f': '\\prod ', '∏': '\\prod '
          };
          let p = '';
          for (let c of text) p += symbolMap[c] || c;
          parts.push(p);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      
      // 【防崩锁】：防止 SVG 元素的 className 对象导致程序崩溃（红钻乱码元凶）
      const cls = (typeof el.className === 'string') ? el.className : (el.getAttribute('class') || '');

      let isHidden = false;
      if (el.isConnected) {
        isHidden = window.getComputedStyle(el).display === 'none';
      } else {
        isHidden = cls.includes('hide-tail') || el.style.display === 'none';
      }
      if (isHidden || cls.includes('strut') || cls.includes('pstrut') || cls.includes('vlist-s') || cls.includes('frac-line')) {
        return;
      }

      // 矩阵与数组
      if (cls.includes('minner') || (cls.includes('mtable') && !el.closest('.minner'))) {
        const mtable = cls.includes('mtable') ? el : el.querySelector(':scope > .mord > .mtable, :scope > .mtable');
        if (mtable) {
          let env = 'matrix';
          if (cls.includes('minner')) {
            const mopen = el.querySelector(':scope > .mopen')?.textContent.trim() || '';
            const mclose = el.querySelector(':scope > .mclose')?.textContent.trim() || '';
            if (mopen === '[' && mclose === ']') env = 'bmatrix';
            else if (mopen === '(' && mclose === ')') env = 'pmatrix';
            else if (mopen === '{' && !mclose) env = 'cases';
            else if (mopen === '|' && mclose === '|') env = 'vmatrix';
            else if (mopen === '{' && mclose === '}') env = 'Bmatrix';
          }
          parts.push(`\\begin{${env}} `);
          const cols = Array.from(mtable.querySelectorAll(':scope > .col-align-c, :scope > .col-align-l, :scope > .col-align-r'));
          if (cols.length > 0) {
            let grid = [];
            cols.forEach((col, colIdx) => {
              const vlist = col.querySelector('.vlist');
              if (!vlist) return;
              const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top);
              rows.forEach(r => {
                const top = parseFloat(r.style.top || '0');
                let rowObj = grid.find(g => Math.abs(g.top - top) < 0.2);
                if (!rowObj) { rowObj = { top: top, cols: [] }; grid.push(rowObj); }
                let currentLen = parts.length;
                walk(r);
                rowObj.cols[colIdx] = parts.splice(currentLen).join('');
              });
            });
            grid.sort((a, b) => a.top - b.top);
            grid.forEach((row, i) => {
              let rowCols = [];
              for (let c = 0; c < cols.length; c++) rowCols.push(row.cols[c] || ' ');
              parts.push(rowCols.join(' & '));
              if (i < grid.length - 1) parts.push(' \\\\ ');
            });
          }
          parts.push(` \\end{${env}}`);
          return;
        }
      }

      // 复杂分数
      if (cls.includes('mfrac')) {
        const vlist = el.querySelector('.vlist');
        if (vlist) {
          const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top && !c.className.includes('frac-line') && !c.querySelector('.frac-line'));
          if (rows.length >= 2) {
            rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
            parts.push('\\frac{'); walk(rows[0]); parts.push('}{'); walk(rows[rows.length - 1]); parts.push('}');
            return;
          }
        }
      }

      // 极限、求和等大符号的上下标
      if (cls.includes('op-limits')) {
        const vlist = el.querySelector('.vlist');
        if (vlist) {
          const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top);
          let baseOp = null, upper = null, lower = null;
          rows.forEach(r => {
            if (r.querySelector('.mop') || r.querySelector('.large-op') || r.textContent?.match(/[∑∫∏]/) || r.textContent?.match(/lim/)) baseOp = r;
          });
          if (!baseOp && rows.length > 0) baseOp = rows[1] || rows[0]; 
          if (baseOp) {
            const baseTop = parseFloat(baseOp.style.top || '0');
            rows.forEach(r => {
              if (r !== baseOp) {
                const t = parseFloat(r.style.top || '0');
                if (t < baseTop - 0.4) upper = r;
                else if (t > baseTop + 0.4) lower = r;
              }
            });
            walk(baseOp);
            if (lower) { parts.push('_{'); walk(lower); parts.push('}'); }
            if (upper) { parts.push('^{'); walk(upper); parts.push('}'); }
            return;
          }
        }
      }

      // 【保留】您完美的 -2.8 上下标阈值修复
      if (cls.includes('msupsub') || cls.includes('msup') || cls.includes('msub')) {
        const vlist = el.querySelector('.vlist');
        if (vlist) {
          const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top);
          if (rows.length > 0) {
            rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
            rows.forEach(row => {
              const top = parseFloat(row.style.top || '0');
              const rowText = row.textContent?.trim() || '';
              if (!rowText) return;
              if (top < -2.8) {
                parts.push('^{'); walk(row); parts.push('}');
              } else {
                parts.push('_{'); walk(row); parts.push('}');
              }
            });
            return;
          }
        }
      }

      // 【核心修复】：根号类名是 sqrt 而非 msqrt，此修复将彻底消灭单点复制的红钻乱码
      if (cls.includes('sqrt')) {
        const body = el.querySelector('.mord');
        const rootIndex = el.querySelector('.root');
        if (rootIndex) {
          parts.push('\\sqrt['); walk(rootIndex); parts.push(']{');
        } else {
          parts.push('\\sqrt{');
        }
        if (body) walk(body);
        parts.push('}');
        return;
      }

      // 规范化大写算符，补齐空格防止粘连 (如 sinx -> sin x)
      if (cls.includes('mop')) {
        const text = el.textContent.trim();
        if (['lim', 'max', 'min', 'sin', 'cos', 'tan', 'log', 'ln', 'exp'].includes(text)) {
          parts.push('\\' + text + ' ');
          return;
        }
      }

      // 导数与矢量符号 (\dot)
      if (cls.includes('accent')) {
        const vlist = el.querySelector('.vlist');
        if (vlist) {
          const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top);
          let accentRow = rows.find(r => r.querySelector('.accent-body'));
          let baseRow = rows.find(r => r !== accentRow);
          
          let accentChar = accentRow ? accentRow.textContent.trim() : '';
          let cmd = '\\bar';
          if (accentChar === '˙' || accentChar === '\u02D9') cmd = '\\dot';
          else if (accentChar === '¨' || accentChar === '\u00A8') cmd = '\\ddot';
          else if (accentChar === '^' || accentChar === '\u005E') cmd = '\\hat';
          else if (accentChar === '~' || accentChar === '\u02DC') cmd = '\\tilde';
          else if (accentChar === '\u2192' || accentChar === '→') cmd = '\\vec';
          
          parts.push(cmd + '{');
          if (baseRow) walk(baseRow);
          parts.push('}');
          return;
        }
      }

      if (cls.includes('mopen') || cls.includes('mclose')) {
        const text = el.textContent.trim();
        if (text) { parts.push(text); return; }
      }

      for (const child of el.childNodes) walk(child);
    }

    walk(katexHtmlEl);
    return parts.join('').replace(/\s+/g, ' ').trim() || null;
  }

  function extractLatex(element) {
    if (!element) return null;
    if (element.hasAttribute('data-nlm-latex')) return element.getAttribute('data-nlm-latex');

    const container = element.closest('.katex, .MathJax, mjx-container, [data-math], math, .math-inline, .math-block') || element;
    const attrLatex = container.getAttribute('data-math') || container.getAttribute('data-latex') ||
                     container.querySelector('[data-math]')?.getAttribute('data-math') ||
                     container.querySelector('[data-latex]')?.getAttribute('data-latex');
    if (attrLatex) return attrLatex;

    try {
      const annotations = Array.from(container.querySelectorAll('*')).filter(n => n.localName === 'annotation');
      for (const ann of annotations) {
        const text = ann.textContent?.trim();
        if (text) {
          const encoding = ann.getAttribute('encoding') || '';
          if (encoding.includes('tex') || encoding.includes('latex') || !encoding) return text;
        }
      }
    } catch (e) {}

    const katexHtml = container.querySelector('.katex-html');
    if (katexHtml) {
      try {
        const visibleText = extractVisibleMathText(katexHtml);
        if (visibleText) return visibleText;
      } catch (e) {}
    }
    return null;
  }

  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

  function latexToMathML(latex, isBlock) {
    const temmlObj = typeof temml !== 'undefined' ? temml : window.temml;
    if (!temmlObj) return null;
    try {
      return temmlObj.renderToString(latex, { displayMode: isBlock, xml: true, annotate: false, throwOnError: true });
    } catch (e) { return null; }
  }

  function toWordMathML(mathml) {
    try {
      // 【消灭空白框的核心】：剔除 Word 无法渲染的不可见乘号与应用符
      mathml = mathml.replace(/[\u2061\u2062\u2063\u2064\u200B]/g, '');

      const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
      if (parsed.getElementsByTagName('parsererror').length > 0) return mathml;
      const root = parsed.documentElement;
      
      const annotations = Array.from(root.querySelectorAll('annotation, annotation-xml'));
      annotations.forEach(a => a.parentNode?.removeChild(a));
      
      const semantics = Array.from(root.querySelectorAll('semantics'));
      semantics.forEach(s => {
        const pres = s.firstElementChild;
        if (pres) s.replaceWith(pres);
        else s.parentNode?.removeChild(s);
      });

      const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
      const outRoot = output.documentElement;
      
      for (const attr of Array.from(root.attributes)) {
        if (!attr.name.startsWith('xmlns') && attr.name !== 'class' && attr.name !== 'style') {
          outRoot.setAttribute(attr.name, attr.value);
        }
      }
      
      for (const child of Array.from(root.childNodes)) {
        const cloned = cloneNodeWithMmlPrefix(output, child);
        if (cloned) outRoot.appendChild(cloned);
      }
      
      return new XMLSerializer().serializeToString(outRoot);
    } catch (e) {
      return mathml;
    }
  }

  function cloneNodeWithMmlPrefix(doc, node) {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.nodeValue ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    
    const el = doc.createElementNS(MATHML_NS, `mml:${node.localName}`);
    for (const attr of Array.from(node.attributes)) {
      if (!attr.name.startsWith('xmlns') && attr.name !== 'class' && attr.name !== 'style') {
        el.setAttribute(attr.name, attr.value);
      }
    }
    
    for (const child of Array.from(node.childNodes)) {
      const cloned = cloneNodeWithMmlPrefix(doc, child);
      if (cloned) el.appendChild(cloned);
    }
    return el;
  }

  function wrapMathMLForWordHtml(mathml) {
    return `<html xmlns:mml="${MATHML_NS}"><head><meta charset="utf-8"></head><body>${mathml}</body></html>`;
  }

  function isDisplayMode(el) {
    if (!el) return false;
    if (el.classList?.contains('katex-display') || el.classList?.contains('math-block')) return true;
    if (el.tagName?.toLowerCase() === 'math' && el.getAttribute('display') === 'block') return true;
    try {
      if (el.closest('.katex-display') || el.closest('.math-block')) return true;
    } catch (e) {}
    return !!el.querySelector('math[display="block"]');
  }

  function wrapFormula(formula, isBlock) {
    const raw = formula.trim().replace(/^(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))$/g, '').trim();
    if (!raw) return { text: '', html: '' };

    const result = { text: '', html: '' };
    
    switch (currentFormat) {
      case 'notion':
        result.text = `$$${raw}$$`;
        break;
      case 'no-dollar':
        result.text = raw;
        break;
      case 'mathml':
        const mml = latexToMathML(raw, isBlock);
        if (mml) {
          const wordMml = toWordMathML(mml);
          result.text = wordMml; 
          let standardMml = mml;
          if (!standardMml.includes('xmlns=')) {
            standardMml = standardMml.replace('<math', `<math xmlns="${MATHML_NS}"`);
          }
          result.html = standardMml;
        } else {
          result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`;
        }
        break;
      case 'latex':
      default:
        result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`;
        break;
    }
    return result;
  }

  async function copyToClipboard(text, html) {
    try {
      if (navigator.clipboard?.write) {
        const items = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
        if (html) {
          const finalHtml = (html.includes('mml:') || html.includes('<math')) ? wrapMathMLForWordHtml(html) : html;
          items['text/html'] = new Blob([finalHtml], { type: 'text/html' });
        }
        await navigator.clipboard.write([new ClipboardItem(items)]);
        return true;
      }
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      return true;
    } catch (e) { return false; }
  }

  async function handleClick(event) {
    const mathEl = findMathElement(event.target);
    if (!mathEl) return;
    event.preventDefault(); event.stopPropagation();
    
    const latex = extractLatex(mathEl);
    if (!latex) { NLM.DOM.showToast(I18N.noLatex, event.clientX, event.clientY, false); return; }
    
    const isBlock = isDisplayMode(mathEl);
    const { text, html } = wrapFormula(latex, isBlock);
    
    const success = await copyToClipboard(text, html);
    
    if (success) { 
      mathEl.classList.add('nlm-formula-clicked'); 
      setTimeout(() => mathEl.classList.remove('nlm-formula-clicked'), 600); 
    }
    NLM.DOM.showToast(success ? I18N.copied : I18N.failed, event.clientX, event.clientY, success);
  }

  function replaceFormulasWithLatex(container, options = {}) {
    const forceLatex = typeof options === 'boolean' ? options : !!options.forceLatex;
    const isHtmlClipboard = !!options.isHtmlClipboard;

    const garbage = ['mat-icon', '.mat-icon', '.google-symbols', '.material-icons', '.material-symbols-outlined', 'button', '.mat-mdc-button-touch-target', '.mat-mdc-button-persistent-ripple', '.mat-mdc-card-actions', '.suggestions-container', '.action-button', '.pin-button', '.source-annotation', 'svg', 'hr', '.citation-marker'];
    garbage.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));
    container.querySelectorAll('sup, [data-citation], .citation').forEach(el => { if (/^[\d,\s·]+$/.test(el.textContent.trim()) || el.textContent.trim().length <= 2) el.remove(); });

    const mathSels = '.katex, [data-math], mjx-container, .MathJax, math, .math-inline, .math-block';
    const placeholders = {};
    let counter = 0;

    container.querySelectorAll(mathSels).forEach(el => {
      if (el.parentElement?.closest(mathSels)) return;
      const latex = extractLatex(el);
      if (latex) {
        const isBlock = isDisplayMode(el);
        const oldFmt = currentFormat;
        if (forceLatex) currentFormat = 'latex';
        const wrapped = wrapFormula(latex, isBlock);
        currentFormat = oldFmt;

        if (isHtmlClipboard && wrapped.html && currentFormat === 'mathml') {
          const ph = `___MATHML_PLACEHOLDER_${counter++}___`;
          placeholders[ph] = wrapped.html;
          
          if (isBlock) {
            const p = document.createElement('p');
            p.style.textAlign = 'center'; 
            p.textContent = ph;
            el.replaceWith(p);
          } else {
            el.replaceWith(document.createTextNode(ph));
          }
        } else {
          const replacementText = isBlock ? `\n${wrapped.text}\n` : wrapped.text;
          el.replaceWith(document.createTextNode(replacementText));
        }
      } else {
        const txt = el.textContent.trim();
        if (txt.length > 0 && !/^[\s·°]+$/.test(txt)) el.replaceWith(document.createTextNode(txt)); else el.remove();
      }
    });
    return placeholders;
  }

  function cleanExtractedText(text) {
    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s*\$\s*/g, ' $')
      .replace(/\$\s+/g, '$')
      .replace(/\s+\$/g, '$')
      .replace(/\$ \$/g, '$$')
      .trim();
  }

  function replaceFormulasWithLatexOld(container) {
    ['sup', '[data-citation]', '.citation', '.source-annotation',
     'button[class*="citation"]', '[class*="footnote"]', '[class*="superscript"]',
     'mat-icon', '.mat-icon', '.google-symbols'
    ].forEach((sel) => {
      try {
        container.querySelectorAll(sel).forEach((el) => {
          const text = (el.textContent || '').trim();
          if (/^[\d,\s·]+$/.test(text) || text.length <= 3) { el.remove(); return; }
          const iconTexts = ['more_horiz', 'expand_more', 'expand_less', 'content_copy', 'keep_pin', 'chat_bubble', 'more_vert', 'thumb_up', 'thumb_down', 'keep', 'copy_all', 'good_response', 'bad_response', 'check', 'landscape_2', 'photo_spark'];
          if (iconTexts.includes(text)) {
            const parent = el.closest('button') || el.closest('.citation-marker') || el.closest('.source-annotation') || el.closest('.mat-mdc-card-actions') || el.closest('.suggestions-container') || el;
            parent.remove();
          }
        });
      } catch { /* skip */ }
    });

    container.querySelectorAll('mat-icon, .mat-icon, .google-symbols, .mat-mdc-button-touch-target, .mat-mdc-button-persistent-ripple').forEach(el => el.remove());
    container.querySelectorAll('.mat-mdc-card-actions, .suggestions-container, .action-button, .pin-button').forEach(el => el.remove());

    container.querySelectorAll('.katex').forEach((katexEl) => {
      const latex = extractLatex(katexEl);
      if (latex) {
        const isBlock = isDisplayMode(katexEl);
        const wrapped = wrapFormula(latex, isBlock);
        if (wrapped.html) {
          const span = document.createElement('span');
          span.innerHTML = wrapped.html;
          katexEl.replaceWith(span);
        } else {
          katexEl.replaceWith(document.createTextNode(wrapped.text));
        }
      }
    });

    container.querySelectorAll('[data-math]').forEach((el) => {
      const latex = el.getAttribute('data-math');
      if (latex) {
        const isBlock = isDisplayMode(el);
        const wrapped = wrapFormula(latex, isBlock);
        el.replaceWith(document.createTextNode(wrapped.text));
      }
    });

    container.querySelectorAll('mjx-container').forEach((mjx) => {
      const texEl = mjx.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]');
      if (texEl?.textContent) {
        const isBlock = mjx.getAttribute('display') === 'true';
        mjx.replaceWith(document.createTextNode(
          isBlock ? ` \\[${texEl.textContent.trim()}\\] ` : ` $${texEl.textContent.trim()}$ `
        ));
      }
    });
  }

  function handleCopy(event) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    // 提取时强制打上烙印，保障源码不随隐藏节点丢失
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parent = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    
    if (parent) {
      parent.querySelectorAll('.katex, [data-math], mjx-container, .MathJax, math').forEach(el => {
        if (range.intersectsNode(el)) {
          const latex = extractLatex(el); 
          if (latex) el.setAttribute('data-nlm-latex', latex); 
        }
      });
    }

    const fragment = range.cloneContents();
    if (!fragment.querySelector('.katex, [data-math], mjx-container, .MathJax, math')) return;

    event.preventDefault();
    event.stopPropagation();

    const htmlFrag = fragment.cloneNode(true);
    const textFrag = fragment.cloneNode(true);

    let effectiveFormat = currentFormat;
    // 不再强制转为 LaTeX，由用户自主决定（配合 UI 上的“试验”标签）
    if (effectiveFormat === 'no-dollar') {
      effectiveFormat = 'latex'; 
    }

    const originalFormat = currentFormat;
    currentFormat = effectiveFormat; 

    let htmlPlaceholders = {};

    if (effectiveFormat === 'latex') {
      replaceFormulasWithLatexOld(htmlFrag); 
      replaceFormulasWithLatex(textFrag, { forceLatex: true }); 
    } else {
      htmlPlaceholders = replaceFormulasWithLatex(htmlFrag, { isHtmlClipboard: true });
      replaceFormulasWithLatex(textFrag, { forceLatex: false });
    }

    currentFormat = originalFormat; 

    const htmlWrapper = document.createElement('div');
    htmlWrapper.setAttribute('xmlns:mml', MATHML_NS);
    htmlWrapper.appendChild(htmlFrag);
    if (effectiveFormat === 'latex') {
      htmlWrapper.querySelectorAll('sup, [data-citation], .citation, .source-annotation').forEach(el => el.remove());
    }
    
    let htmlContent = htmlWrapper.innerHTML;
    for (const [ph, mmlStr] of Object.entries(htmlPlaceholders)) {
      htmlContent = htmlContent.replace(ph, mmlStr);
    }

    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
    textWrapper.appendChild(textFrag);
    document.body.appendChild(textWrapper);
    
    let text = (textWrapper.innerText || textWrapper.textContent || '').replace(/[\u00B0\u2022\u2219\u25CF]/g, '');
    document.body.removeChild(textWrapper);

    if (effectiveFormat === 'latex') {
      text = cleanExtractedText(text);
    } else {
      text = text.trim();
    }

    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', htmlContent);
  }

  async function init() {
    if (isInitialized) return;
    
    const savedFormat = await NLM.Storage.get('formulaCopyFormat');
    if (savedFormat) {
      currentFormat = savedFormat;
    }
    
    NLM.Storage.onChange((changes, area) => { 
      if (area === 'sync' && changes.formulaCopyFormat) {
        currentFormat = changes.formulaCopyFormat.newValue || 'latex';
      } 
    });

    document.addEventListener('click', handleClick, true);
    document.addEventListener('copy', handleCopy, true);
    isInitialized = true;
  }

  // 暴露 extractLatex 供导出预览组件(export.js) 调用中转
  return { 
    init, 
    extractLatex, 
    replaceFormulasWithLatex,
    destroy: () => { document.removeEventListener('click', handleClick, true); document.removeEventListener('copy', handleCopy, true); isInitialized = false; } 
  };
})();
