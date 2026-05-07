/**
 * NLM Enhancer 公式点击复制模块
 * 点击页面中渲染 of 数学公式，按用户选择的格式复制到剪贴板
 * 支持格式：LaTeX ($...$)、MathML (Word)、纯文本 (无$)、Notion ($$...$$)
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.FormulaCopy = (() => {
  const LOG = '[NLM Enhancer FormulaCopy]';
  let currentFormat = 'latex';
  let isInitialized = false;

  const I18N = {
    get copied() { return NLM.i18n.get('toastFormulaCopied'); },
    get failed() { return NLM.i18n.get('toastCopyFailed'); },
    get noLatex() { return NLM.i18n.get('toastNoLatex'); },
  };

  function findMathElement(target) {
    const selectors = ['.katex', '.katex-display', '[data-math]', 'mjx-container', '.MathJax', '.math-inline', '.math-block'];
    for (const sel of selectors) {
      const found = target.closest(sel);
      if (found) return found;
    }
    return null;
  }

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
            '\u220f': '\\prod ', '∏': '\\prod ',
            '\u222a': '\\cup ', '∪': '\\cup ', '\u2229': '\\cap ', '∩': '\\cap ',
            '\u2208': '\\in ', '∈': '\\in ', '\u2209': '\\notin ', '∉': '\\notin '
          };
          let p = '';
          for (let c of text) p += symbolMap[c] || c;
          parts.push(p);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      
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

      if (cls.includes('op-limits')) {
        const vlist = el.querySelector('.vlist');
        if (vlist) {
          const rows = Array.from(vlist.children).filter(c => c.tagName === 'SPAN' && c.style.top);
          let baseOp = null, upper = null, lower = null;
          rows.forEach(r => {
            if (r.querySelector('.mop') || r.querySelector('.large-op') || r.textContent?.match(/[∑∫∏]/) || r.textContent?.match(/lim/)) {
              baseOp = r;
            }
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

      if (cls.includes('mop')) {
        const text = el.textContent.trim();
        if (['lim', 'max', 'min', 'sin', 'cos', 'tan', 'log', 'ln', 'exp'].includes(text)) {
          parts.push('\\' + text + ' ');
          return;
        }
      }

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
          else if (accentChar === 'ˉ' || accentChar === '\u02C9' || accentChar === '\u0304') cmd = '\\bar';
          else if (accentChar === '\u2192' || accentChar === '→') cmd = '\\vec';
          
          parts.push(cmd + '{');
          if (baseRow) walk(baseRow);
          parts.push('}');
          return;
        }
      }

      if (cls.includes('mopen') || cls.includes('mclose')) {
        // 只提取当前节点的直接文本内容（括号本身），不包含子节点
        let bracketText = "";
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            bracketText += child.textContent.trim();
          }
        }
        if (bracketText) parts.push(bracketText);
        
        // 递归处理子节点（特别是可能嵌套在内部的 msupsub）
        for (const child of el.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            walk(child);
          }
        }
        return;
      }

      for (const child of el.childNodes) walk(child);
    }

    walk(katexHtmlEl);
    return parts.join('').replace(/\s+/g, ' ').trim() || null;
  }

  function convertMathmlToLatex(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    
    const tag = (node.localName || node.tagName).toLowerCase().replace(/^.*:/, '');
    const children = Array.from(node.children);
    const parse = (n) => n ? convertMathmlToLatex(n) : '';

    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': case 'semantics':
        return children.map(parse).join('');
      case 'mi': 
      case 'mn': 
        return node.textContent.trim();
      case 'mo': 
        const text = node.textContent.trim();
        const moMap = {
          '∑': '\\sum ', '∫': '\\int ', '∏': '\\prod ',
          'lim': '\\lim ', 'max': '\\max ', 'min': '\\min ',
          '→': '\\to ', '∞': '\\infty ', '≈': '\\approx ', '≠': '\\neq ',
          '≤': '\\leq ', '≥': '\\geq ', '×': '\\times ', '÷': '\\div ',
          '±': '\\pm ', '⋅': '\\cdot ', '∪': '\\cup ', '∩': '\\cap ',
          '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊃': '\\supset '
        };
        return moMap[text] || text;
      case 'msub': 
        return `${parse(children[0])}_{${parse(children[1])}}`;
      case 'msup': 
        return `${parse(children[0])}^{${parse(children[1])}}`;
      case 'msubsup': 
      case 'munderover':
        return `${parse(children[0])}_{${parse(children[1])}}^{${parse(children[2])}}`;
      case 'munder':
        return `${parse(children[0])}_{${parse(children[1])}}`;
      case 'mover': 
        return `${parse(children[0])}^{${parse(children[1])}}`;
      case 'mfrac': 
        return `\\frac{${parse(children[0])}}{${parse(children[1])}}`;
      case 'msqrt':
        return `\\sqrt{${children.map(parse).join('')}}`;
      case 'mroot': 
        return `\\sqrt[${parse(children[1])}]{${parse(children[0])}}`;
      case 'mtable':
        return `\\begin{bmatrix} ${children.map(parse).join(' \\\\ ')} \\end{bmatrix}`;
      case 'mtr':
        return children.map(parse).join(' & ');
      case 'mtd':
        return children.map(parse).join('');
      case 'mfenced':
        const open = node.getAttribute('open') || '(';
        const close = node.getAttribute('close') || ')';
        return `\\left${open} ${children.map(parse).join('')} \\right${close}`;
      case 'mspace':
        return ' ';
      case 'mtext':
        return `\\text{${node.textContent}}`;
      default: 
        return children.map(parse).join('');
    }
  }

  function extractLatex(element) {
    if (!element) return null;

    if (element.hasAttribute('data-nlm-latex')) {
      return element.getAttribute('data-nlm-latex');
    }

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

    if (container.localName === 'mjx-container' || container.querySelector('mjx-container')) {
      const mjx = container.localName === 'mjx-container' ? container : container.querySelector('mjx-container');
      const script = mjx.querySelector('script[type^="math/tex"]');
      if (script?.textContent) return script.textContent.trim();
      const assist = mjx.querySelector('[aria-label]');
      if (assist) {
        const label = assist.getAttribute('aria-label');
        if (label && (label.includes('\\') || label.includes('^'))) return label;
      }
    }

    const mathml = Array.from(container.querySelectorAll('*')).find(n => n.localName === 'math') || 
                   (container.localName === 'math' ? container : null);
    if (mathml) {
      try {
        const parsed = convertMathmlToLatex(mathml);
        if (parsed && parsed.length > 1) return parsed;
      } catch (e) {}
    }

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
      
      const serialized = new XMLSerializer().serializeToString(outRoot);
      // 增加清洗步骤：使用正则全局替换，将 ± 替换为安全的 XML 实体，并替换排版级减号
      return serialized
        .replace(/±/g, '&#x00B1;')
        .replace(/\u2212/g, '-');
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
    let raw = formula.trim().replace(/^(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))$/g, '').trim();
    
    // 修复 Bug 3: 将 Unicode 撇号 ′ (U+2032) 和中文单引号 ’ (U+2019) 替换为标准 ASCII 单引号 '
    // 修复 Bug 4: 消除冗余的 ^{'} 语法（MathType 不支持），直接替换为 ' 或 ^{\prime}
    raw = raw.replace(/[′’]/g, "'").replace(/\^{'}/g, "'");

    // 修复：将常见的 Unicode 数学符号替换为 LaTeX 命令，增强 MathType 兼容性
    const unicodeLatexMap = {
      'ε': '\\varepsilon ', 'ϵ': '\\varepsilon ',
      '∪': '\\cup ', '∩': '\\cap ', '∈': '\\in ', '∉': '\\notin ',
      '⊂': '\\subset ', '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ',
      '∅': '\\emptyset ', '∀': '\\forall ', '∃': '\\exists ', '¬': '\\neg ',
      '∨': '\\vee ', '∧': '\\wedge ', '∞': '\\infty ', '≈': '\\approx ',
      '≠': '\\neq ', '≤': '\\leq ', '≥': '\\geq ', '±': '\\pm ', '×': '\\times ', '÷': '\\div '
    };
    for (const [u, l] of Object.entries(unicodeLatexMap)) {
      if (raw.includes(u)) raw = raw.split(u).join(l);
    }

    // 满足用户偏好：使用 \varepsilon 代替 \epsilon
    raw = raw.replace(/\\epsilon\b/g, '\\varepsilon ');

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
    
    const isBlock = isDisplayMode(mathEl);
    let text = '', html = '';

    // 双轨并行：如果开启了 V2 引擎，则走新流水线
    if (NLM.FormulaV2 && NLM.FormulaV2.Engine.isActive()) {
      const wrapped = NLM.FormulaV2.Engine.process(mathEl, currentFormat, isBlock);
      if (!wrapped) { NLM.DOM.showToast(I18N.noLatex, event.clientX, event.clientY, false); return; }
      text = wrapped.text;
      html = wrapped.html;
    } else {
      // V1 原有逻辑
      const latex = extractLatex(mathEl);
      if (!latex) { NLM.DOM.showToast(I18N.noLatex, event.clientX, event.clientY, false); return; }
      const wrapped = wrapFormula(latex, isBlock);
      text = wrapped.text;
      html = wrapped.html;
    }
    
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
      const isBlock = isDisplayMode(el);
      let wrapped = null;
      const oldFmt = currentFormat;
      if (forceLatex) currentFormat = 'latex';

      if (NLM.FormulaV2 && NLM.FormulaV2.Engine.isActive()) {
        wrapped = NLM.FormulaV2.Engine.process(el, currentFormat, isBlock);
      } else {
        const latex = extractLatex(el);
        if (latex) {
          wrapped = wrapFormula(latex, isBlock);
        }
      }
      
      currentFormat = oldFmt;

      if (wrapped) {
        if (isHtmlClipboard && wrapped.html && currentFormat === 'mathml') {
          const ph = `___MATHML_PLACEHOLDER_${counter++}___`;
          // 关键修复：存储 text 和 html 两个版本的占位内容
          placeholders[ph] = { text: wrapped.text, html: wrapped.html };
          
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
      const isBlock = isDisplayMode(katexEl);
      let wrapped = null;
      if (NLM.FormulaV2 && NLM.FormulaV2.Engine.isActive()) {
        wrapped = NLM.FormulaV2.Engine.process(katexEl, currentFormat, isBlock);
      } else {
        const latex = extractLatex(katexEl);
        if (latex) wrapped = wrapFormula(latex, isBlock);
      }
      if (wrapped) {
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
      const isBlock = isDisplayMode(el);
      let wrapped = null;
      if (NLM.FormulaV2 && NLM.FormulaV2.Engine.isActive()) {
        wrapped = NLM.FormulaV2.Engine.process(el, currentFormat, isBlock);
      } else {
        const latex = el.getAttribute('data-math');
        if (latex) wrapped = wrapFormula(latex, isBlock);
      }
      if (wrapped) el.replaceWith(document.createTextNode(wrapped.text));
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

  /**
   * 核心转译逻辑：将包含公式的 DOM 节点转译为适合剪贴板的 text 和 html
   */
  function transformElementForClipboard(rootElement) {
    const htmlFrag = rootElement.cloneNode(true);
    const textFrag = rootElement.cloneNode(true);

    let effectiveFormat = currentFormat;
    if (effectiveFormat === 'no-dollar') effectiveFormat = 'latex';

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
    
    // 如果是 MathML (Word) 格式，处理 Markdown 语法
    if (effectiveFormat === 'mathml') {
      htmlContent = htmlContent
        .replace(/[·\s]*\*\*([步S][骤t][ep]?\s?\d+[:：][^*]*)\*\*/g, '<br><b>$1</b> ') // 恢复软回车，且不在标题后加换行
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); // 通用加粗
    }

    for (const [ph, mmlObj] of Object.entries(htmlPlaceholders)) {
      const val = (typeof mmlObj === 'object') ? (mmlObj.html || mmlObj.text) : mmlObj;
      htmlContent = htmlContent.replace(ph, val);
    }

    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
    textWrapper.appendChild(textFrag);
    document.body.appendChild(textWrapper);
    let text = (textWrapper.innerText || textWrapper.textContent || '').replace(/[\u00B0\u2022\u2219\u25CF]/g, '');
    document.body.removeChild(textWrapper);

    for (const [ph, mmlObj] of Object.entries(htmlPlaceholders)) {
      const val = (typeof mmlObj === 'object') ? (mmlObj.text || mmlObj.html) : mmlObj;
      text = text.replace(ph, val);
    }

    if (effectiveFormat === 'latex') {
      text = cleanExtractedText(text);
    } else if (effectiveFormat === 'mathml') {
      // 文本模式清理 Markdown
      text = text
        .replace(/[·\s]*\*\*([步S][骤t][ep]?\s?\d+[:：][^*]*)\*\*/g, '\n$1 ') // 步骤标题
        .replace(/\*\*/g, '')
        .trim();
    } else {
      text = text.trim();
    }

    return { text, html: htmlContent };
  }

  async function handleCopyFromElement(element) {
    try {
      const { text, html } = transformElementForClipboard(element);
      return await copyToClipboard(text, html);
    } catch (e) {
      console.error('[NLM] 复制失败:', e);
      return false;
    }
  }

  function handleCopy(event) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parent = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    
    if (parent) {
      parent.querySelectorAll('.katex, [data-math], mjx-container, .MathJax, math, [nodeName="math"], [nodeName="mml:math"]').forEach(el => {
        if (range.intersectsNode(el)) {
          const latex = extractLatex(el); 
          if (latex) el.setAttribute('data-nlm-latex', latex); 
        }
      });
    }

    const fragment = range.cloneContents();
    
    // 扩大拦截范围：如果包含公式，或者包含 Markdown 符号 **，则拦截并处理
    const hasMath = !!fragment.querySelector('.katex, [data-math], mjx-container, .MathJax, math, [nodeName="math"], [nodeName="mml:math"]');
    const hasMarkdown = fragment.textContent.includes('**');
    
    if (!hasMath && !hasMarkdown) return;

    event.preventDefault();
    event.stopPropagation();

    const { text, html } = transformElementForClipboard(fragment);

    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', html);
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

  function destroy() {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('copy', handleCopy, true);
    isInitialized = false;
  }

  return { 
    init, 
    destroy,
    handleCopyFromElement,
    extractLatex, 
    replaceFormulasWithLatex,
    convertMathmlToLatex,
    extractVisibleMathText
  };
})();

/**
 * ==========================================
 * NLM Enhancer 公式处理核心 v2.0 (双轨重构中)
 * 采用 流水线架构：DOM -> 适配器 -> Clean LaTeX (IR) -> 归一化 -> 转换器 -> 输出
 * ==========================================
 */
NLM.FormulaV2 = (() => {
  const LOG = '[NLM Enhancer FormulaV2]';
  const USE_V2_ENGINE = true; // 灰度发布开关：已开启实盘测试

  // 1. 适配器层 (Input Adapters)
  const Adapters = {
    metadata: {
      canHandle: (node) => {
        if (node.hasAttribute('data-nlm-latex')) return true;
        const container = node.closest('.katex, .MathJax, mjx-container, [data-math], math, .math-inline, .math-block') || node;
        return !!(container.getAttribute('data-math') || container.getAttribute('data-latex') ||
                 container.querySelector('[data-math]') || container.querySelector('[data-latex]') ||
                 container.querySelector('annotation[encoding*="tex"]'));
      },
      extract: (node) => {
        if (node.hasAttribute('data-nlm-latex')) return node.getAttribute('data-nlm-latex');
        const container = node.closest('.katex, .MathJax, mjx-container, [data-math], math, .math-inline, .math-block') || node;
        const attrLatex = container.getAttribute('data-math') || container.getAttribute('data-latex') ||
                          container.querySelector('[data-math]')?.getAttribute('data-math') ||
                          container.querySelector('[data-latex]')?.getAttribute('data-latex');
        if (attrLatex) return attrLatex;
        const ann = Array.from(container.querySelectorAll('annotation')).find(n => {
          const enc = n.getAttribute('encoding') || '';
          return enc.includes('tex') || enc.includes('latex') || !enc;
        });
        return ann ? ann.textContent?.trim() : null;
      }
    },
    mathjax: {
      canHandle: (node) => {
        const container = node.closest('mjx-container') || (node.localName === 'mjx-container' ? node : node.querySelector('mjx-container'));
        return !!container;
      },
      extract: (node) => {
        const container = node.closest('mjx-container') || (node.localName === 'mjx-container' ? node : node.querySelector('mjx-container'));
        const script = container.querySelector('script[type^="math/tex"]');
        if (script?.textContent) return script.textContent.trim();
        const assist = container.querySelector('[aria-label]');
        if (assist) {
          const label = assist.getAttribute('aria-label');
          if (label && (label.includes('\\') || label.includes('^'))) return label;
        }
        return null;
      }
    },
    mathml: {
      canHandle: (node) => {
        const container = node.closest('math') || (node.localName === 'math' ? node : node.querySelector('math'));
        return !!container;
      },
      extract: (node) => {
        const container = node.closest('math') || (node.localName === 'math' ? node : node.querySelector('math'));
        if (!container) return null;
        // 借用 V1 的 convertMathmlToLatex 函数
        try {
          const parsed = NLM.FormulaCopy.convertMathmlToLatex ? NLM.FormulaCopy.convertMathmlToLatex(container) : null;
          return (parsed && parsed.length > 1) ? parsed : null;
        } catch (e) { return null; }
      }
    },
    katex: {
      canHandle: (node) => {
        const container = node.closest('.katex-html') || node.querySelector('.katex-html') || node.closest('.katex');
        return !!container;
      },
      extract: (node) => {
        const container = node.closest('.katex-html') || node.querySelector('.katex-html');
        if (!container) return null;
        try {
          const visibleText = NLM.FormulaCopy.extractVisibleMathText ? NLM.FormulaCopy.extractVisibleMathText(container) : null;
          return visibleText || null;
        } catch (e) { return null; }
      }
    }
  };

  // 2. 归一化层 (Normalizer)
  const Normalizer = {
    clean: (rawLatex) => {
      if (!rawLatex) return null;
      let clean = rawLatex.trim().replace(/^(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))$/g, '').trim();
      
      // 核心修复：将 Unicode 数学字符转换为 ASCII LaTeX 指令，从源头消除乱码风险
      const mathMap = {
        'ε': '\\varepsilon ', 'ϵ': '\\varepsilon ', 'μ': '\\mu ', 'σ': '\\sigma ', 'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ',
        'δ': '\\delta ', 'θ': '\\theta ', 'λ': '\\lambda ', 'π': '\\pi ', 'ω': '\\omega ', 'Δ': '\\Delta ', '∆': '\\Delta ',
        '×': '\\times ', '±': '\\pm ', '÷': '\\div ', '∞': '\\infty ', '≈': '\\approx ', '≠': '\\neq ',
        '≤': '\\leq ', '≥': '\\geq ', '∫': '\\int ', '∑': '\\sum ', '∏': '\\prod ', '∂': '\\partial ',
        '⋅': '\\cdot ', '…': '\\dots ', '∇': '\\nabla ', '∀': '\\forall ', '∃': '\\exists ', '∈': '\\in '
      };
      for (const [uni, tex] of Object.entries(mathMap)) {
        clean = clean.split(uni).join(tex);
      }

      // 满足用户偏好：使用 \varepsilon 代替 \epsilon
      clean = clean.replace(/\\epsilon\b/g, '\\varepsilon ');

      // 修复 Unicode 撇号等常见语法错误
      clean = clean.replace(/[′’]/g, "'").replace(/\^{'}/g, "'");

      // 深度优化导数撇号：消除视觉解析器产生的 ^{^{′}} 嵌套，降维为标准的 ' 语法
      clean = clean.replace(/\^\{\^\{(['′]+)\}\}/g, "$1").replace(/\^\{(['′]+)\}/g, "$1");
      clean = clean.replace(/([a-zA-Z])\^\{?(['′]+)\}?/g, "$1$2"); 
      
      // 修复全角/Unicode绝对值符号，并尝试将其标准化为 \left| \right| 以获得更好的 MathML 渲染
      clean = clean.replace(/[∣|｜｜]([^∣|｜｜\n]+)[∣|｜｜]/g, "\\left| $1 \\right|");
      clean = clean.replace(/∣/g, '|').replace(/\u2223/g, '|').replace(/‖/g, '\\|');
      return clean || null;
    }
  };

  // 3. 转换器层 (Output Transformers)
  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

  const Transformers = {
    latex: (cleanLatex, isBlock) => {
      return { text: isBlock ? `\\[${cleanLatex}\\]` : `$${cleanLatex}$`, html: null };
    },
    notion: (cleanLatex, isBlock) => {
      return { text: `$$${cleanLatex}$$`, html: null };
    },
    'no-dollar': (cleanLatex, isBlock) => {
      return { text: cleanLatex, html: null };
    },
    mathml: (cleanLatex, isBlock) => {
      // 使用 TeMML 将 LaTeX 转换为原生 MathML
      const temmlObj = typeof temml !== 'undefined' ? temml : window.temml;
      if (!temmlObj) return Transformers.latex(cleanLatex, isBlock); // 降级

      let mml = null;
      try {
        mml = temmlObj.renderToString(cleanLatex, { displayMode: isBlock, xml: true, annotate: false, throwOnError: true });
      } catch (e) {
        return Transformers.latex(cleanLatex, isBlock); // 渲染失败时降级
      }

      if (!mml) return Transformers.latex(cleanLatex, isBlock);

      // 处理 Word 兼容的 MathML
      let wordMml = mml;
      try {
        // 清洗零宽字符
        wordMml = wordMml.replace(/[\u2061\u2062\u2063\u2064\u200B]/g, '');
        const parsed = new DOMParser().parseFromString(wordMml, 'application/xml');
        if (parsed.getElementsByTagName('parsererror').length === 0) {
          const root = parsed.documentElement;
          
          // 深度清洗冗余包装
          Array.from(root.querySelectorAll('annotation, annotation-xml')).forEach(a => a.parentNode?.removeChild(a));
          const redundantTags = ['semantics', 'mpadded', 'mstyle', 'mrow'];
          redundantTags.forEach(tagName => {
            Array.from(root.querySelectorAll(tagName)).forEach(node => {
              if (tagName === 'mrow' && node.childNodes.length !== 1) return;
              const fragment = document.createDocumentFragment();
              Array.from(node.childNodes).forEach(c => fragment.appendChild(c));
              node.replaceWith(fragment);
            });
          });

          // 构建带 mml: 前缀的 Word 标准格式
          const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
          const outRoot = output.documentElement;
          for (const attr of Array.from(root.attributes)) {
            if (!['class', 'style', 'xmlns'].includes(attr.name)) outRoot.setAttribute(attr.name, attr.value);
          }

          function cloneWithPrefix(doc, node) {
            if (node.nodeType === 3) return doc.createTextNode(node.textContent);
            if (node.nodeType !== 1) return null;
            
            const el = doc.createElementNS(MATHML_NS, 'mml:' + node.localName);
            if (node.localName === 'mover') el.setAttribute('accent', 'true');
            
            for (const attr of Array.from(node.attributes)) {
              if (['class', 'style', 'stretchy', 'mathvariant', 'lspace', 'rspace', 'voffset', 'movablelimits'].includes(attr.name)) continue;
              if (attr.name.startsWith('xmlns')) continue;
              el.setAttribute(attr.name, attr.value);
            }

            for (const child of Array.from(node.childNodes)) {
              const cloned = cloneWithPrefix(doc, child);
              if (cloned) el.appendChild(cloned);
            }
            return el;
          }

          for (const child of Array.from(root.childNodes)) {
            const cloned = cloneWithPrefix(output, child);
            if (cloned) outRoot.appendChild(cloned);
          }

          // 4. 最终序列化与字符纠偏 (保留横杠修复)
          wordMml = new XMLSerializer().serializeToString(outRoot)
            .replace(/[\u0080-\uFFFF]/g, m => '&#x' + m.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase() + ';')
            .replace(/(&#x203E;|&#x0304;|&#x0305;)/g, '&#x00AF;')
            .replace(/(&#x200B;|&#x2061;|&#x2062;|&#x2063;|&#x2064;|&#xFEFF;)/g, ''); 
        }
      } catch (e) {
        // 解析失败保留原始 mml
      }

      // 标准 HTML 剪贴板格式
      let standardMml = mml;
      if (!standardMml.includes('xmlns=')) {
        standardMml = standardMml.replace('<math', `<math xmlns="${MATHML_NS}"`);
      }
      // 同样对 HTML 格式进行实体编码，防止 Word 在解析 HTML 剪贴板时产生编码错乱
      standardMml = standardMml.replace(/[\u0080-\uFFFF]/g, m => '&#x' + m.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase() + ';');

      return { text: wordMml, html: standardMml };
    }
  };

  // 4. 引擎控制中枢 (Engine)
  const Engine = {
    isActive: () => USE_V2_ENGINE,
    
    process: (domNode, format, isBlock) => {
      // 遍历寻找能处理该 DOM 的适配器
      let rawLatex = null;
      for (const key in Adapters) {
        if (Adapters[key].canHandle(domNode)) {
          rawLatex = Adapters[key].extract(domNode);
          if (rawLatex) break;
        }
      }

      if (!rawLatex) return null;

      // 归一化为干净的 LaTeX (IR)
      const cleanLatex = Normalizer.clean(rawLatex);
      if (!cleanLatex) return null;

      // 转换为目标格式
      const transformer = Transformers[format] || Transformers.latex;
      return transformer(cleanLatex, isBlock);
    }
  };

  return {
    Engine,
    Adapters,
    Normalizer,
    Transformers
  };
})();

