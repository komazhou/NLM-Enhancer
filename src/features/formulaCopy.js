/**
 * NotebookLM++ 公式点击复制模块
 * 点击页面中渲染的数学公式，按用户选择的格式复制到剪贴板
 * 支持格式：LaTeX ($...$)、MathML (Word)、纯文本 (无$)、Notion ($$...$$)
 *
 * 增强复制：选中含公式的段落 Ctrl+C 时，自动将公式替换为 LaTeX 文本
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

  // ========================================================
  // 公式查找与 LaTeX 提取
  // ========================================================

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
            '\u2212': '-', '\u22c5': '\\cdot ', '\u2217': '*', '\u00d7': '\\times ',
            '\u00f7': '\\div ', '\u00b1': '\\pm ', '\u2264': '\\leq ', '\u2265': '\\geq ',
            '\u2260': '\\neq ', '\u2248': '\\approx ', '\u221e': '\\infty ', '\u2202': '\\partial ',
            '\u2206': '\\Delta ', '\u03b1': '\\alpha ', '\u03b2': '\\beta ', '\u03b3': '\\gamma ',
            '\u03c0': '\\pi ', '\u03c3': '\\sigma ', '\u03bc': '\\mu ', '\u03c9': '\\omega ',
            '\u03a9': '\\Omega ', '\u2192': '\\rightarrow ', '\u222b': '\\int ', '\u2211': '\\sum ',
            '\u220f': '\\prod ',
          };
          let processed = '';
          for (const char of text) processed += symbolMap[char] || char;
          parts.push(processed);
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      const className = el.className || '';
      
      // 兼容离线 DOM（DocumentFragment）：获取 computedStyle 或 inline style
      let isHidden = false;
      if (el.isConnected) {
        const style = window.getComputedStyle(el);
        isHidden = style.display === 'none' || style.visibility === 'hidden';
      } else {
        isHidden = className.includes('hide-tail') || el.style.display === 'none';
      }
      if (isHidden) return;
      
      if (className.includes('strut') || className.includes('pstrut') || className.includes('vlist-s')) return;

      if (className.includes('mfrac')) {
        const rows = Array.from(el.querySelectorAll('.vlist > span[style*="top"]'));
        if (rows.length >= 2) {
          rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
          const numerRow = rows[0]; const denomRow = rows[rows.length - 1];
          if (numerRow && denomRow && numerRow !== denomRow) {
            parts.push('\\frac{'); walk(numerRow); parts.push('}{'); walk(denomRow); parts.push('}');
            return;
          }
        }
      }

      if (className.includes('msupsub')) {
        const rows = Array.from(el.querySelectorAll('.vlist > span[style*="top"]'));
        if (rows.length > 0) {
          rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
          rows.forEach(row => {
            const top = parseFloat(row.style.top || '0');
            const rowText = row.innerText?.trim() || row.textContent?.trim() || '';
            if (!rowText) return;
            if (top < -3.1) { parts.push('^{'); walk(row); parts.push('}'); } 
            else { parts.push('_{'); walk(row); parts.push('}'); }
          });
          return;
        }
      }

      if (className.includes('msqrt')) {
        const body = el.querySelector('.mord');
        if (body) { parts.push('\\sqrt{'); walk(body); parts.push('}'); return; }
      }
      
      if (className.includes('mopen') || className.includes('mclose')) {
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
    const attrLatex = element.getAttribute('data-math') || element.getAttribute('data-latex') ||
                     element.querySelector('[data-math]')?.getAttribute('data-math') ||
                     element.querySelector('[data-latex]')?.getAttribute('data-latex');
    if (attrLatex) return attrLatex;

    try {
      const annotations = element.querySelectorAll('annotation');
      for (const ann of annotations) {
        const text = ann.textContent?.trim();
        if (text) {
          const encoding = ann.getAttribute('encoding') || '';
          if (encoding.includes('tex') || encoding.includes('latex') || !encoding) return text;
        }
      }
    } catch (e) {}

    if (element.tagName.toLowerCase() === 'mjx-container' || element.querySelector('mjx-container')) {
      const mjx = element.tagName.toLowerCase() === 'mjx-container' ? element : element.querySelector('mjx-container');
      const script = mjx.querySelector('script[type^="math/tex"]');
      if (script?.textContent) return script.textContent.trim();
      const assist = mjx.querySelector('[aria-label]');
      if (assist) {
        const label = assist.getAttribute('aria-label');
        if (label && (label.includes('\\') || label.includes('^'))) return label;
      }
    }

    const mathml = element.querySelector('.katex-mathml math') || element.querySelector('math');
    if (mathml) {
      try {
        const parsed = convertMathmlToLatex(mathml);
        if (parsed && parsed.length > 1) return parsed;
      } catch (e) {}
    }

    const katexHtml = element.querySelector('.katex-html');
    if (katexHtml) {
      try {
        const visibleText = extractVisibleMathText(katexHtml);
        if (visibleText) return visibleText;
      } catch (e) {}
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.startsWith('\\') || (t.includes('^') && t.includes('_')) || t.includes('\\frac')) return t;
    }

    return null;
  }

  function convertMathmlToLatex(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.children);
    const parse = (n) => convertMathmlToLatex(n);
    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': return children.map(parse).join('');
      case 'mi': case 'mn': case 'mo': return node.textContent.trim();
      case 'msub': return `${parse(children[0])}_{${parse(children[1])}}`;
      case 'msup': return `${parse(children[0])}^{${parse(children[1])}}`;
      case 'mfrac': return `\\frac{${parse(children[0])}}{${parse(children[1])}}`;
      case 'msqrt': return `\\sqrt{${children.map(parse).join('')}}`;
      default: return children.map(parse).join('');
    }
  }

  // ========================================================
  // MathML 生成管线
  // ========================================================

  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

  function latexToMathML(latex, isBlock) {
    const temmlObj = typeof temml !== 'undefined' ? temml : window.temml;
    if (!temmlObj) return null;
    try {
      return temmlObj.renderToString(latex, { displayMode: isBlock, xml: true, annotate: false, throwOnError: true });
    } catch (e) { return null; }
  }

  function stripMathMLAnnotations(mathml) {
    return mathml.replace(/<annotation(?:-xml)?[\s\S]*?<\/annotation(?:-xml)?>/g, '').replace(/<semantics>\s*([\s\S]*?)\s*<\/semantics>/g, '$1');
  }

  function ensureMathMLNamespace(mathml) {
    if (mathml.includes('xmlns=')) return mathml;
    return mathml.replace('<math', `<math xmlns="${MATHML_NS}"`);
  }

  function toWordMathML(mathml) {
    const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length > 0) return stripMathMLAnnotations(mathml);
    const root = parsed.documentElement;
    if (root.localName !== 'math') return stripMathMLAnnotations(mathml);
    for (const ann of Array.from(root.getElementsByTagName('annotation'))) ann.parentNode?.removeChild(ann);
    const semantics = Array.from(root.getElementsByTagName('semantics')).find(node => node.parentElement === root);
    if (semantics) {
      const pres = semantics.firstElementChild;
      if (pres) { while (root.firstChild) root.removeChild(root.firstChild); root.appendChild(pres); }
    }
    const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
    const outRoot = output.documentElement;
    for (const attr of Array.from(root.attributes)) { if (!attr.name.startsWith('xmlns')) outRoot.setAttribute(attr.name, attr.value); }
    for (const child of Array.from(root.childNodes)) { outRoot.appendChild(cloneNodeWithMmlPrefix(output, child)); }
    return new XMLSerializer().serializeToString(outRoot);
  }

  function cloneNodeWithMmlPrefix(doc, node) {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.nodeValue ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return doc.importNode(node, true);
    const isMML = (node.namespaceURI === MATHML_NS || node.namespaceURI === null);
    const el = isMML ? doc.createElementNS(MATHML_NS, `mml:${node.localName}`) : doc.createElement(node.tagName);
    for (const attr of Array.from(node.attributes)) { if (!attr.name.startsWith('xmlns')) el.setAttribute(attr.name, attr.value); }
    for (const child of Array.from(node.childNodes)) { el.appendChild(cloneNodeWithMmlPrefix(doc, child)); }
    return el;
  }

  function wrapMathMLForWordHtml(mathml) {
    return `<html xmlns:mml="${MATHML_NS}"><head><meta charset="utf-8"></head><body><!--StartFragment-->${mathml}<!--EndFragment--></body></html>`;
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
    const raw = formula.trim().replace(/^\$\$?|\$\$?$/g, '');
    const result = { text: '', html: '' };
    switch (currentFormat) {
      case 'mathml':
        const mml = latexToMathML(raw, isBlock);
        if (mml) {
          const processed = toWordMathML(ensureMathMLNamespace(stripMathMLAnnotations(mml)));
          result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`;
          result.html = processed;
        } else { result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`; }
        break;
      case 'no-dollar': result.text = raw; break;
      case 'notion': result.text = `$$${raw}$$`; break;
      default: 
        result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`;
        const fallbackMml = latexToMathML(raw, isBlock);
        if (fallbackMml) {
           result.html = toWordMathML(ensureMathMLNamespace(stripMathMLAnnotations(fallbackMml)));
        }
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
    
    let plainText = text;
    if (currentFormat === 'mathml' && html) plainText = html;
    
    const success = await copyToClipboard(plainText, html);
    if (success) { mathEl.classList.add('nlm-formula-clicked'); setTimeout(() => mathEl.classList.remove('nlm-formula-clicked'), 600); }
    NLM.DOM.showToast(success ? I18N.copied : I18N.failed, event.clientX, event.clientY, success);
  }

  function replaceFormulasWithLatex(container, forceLatex = false) {
    const garbage = ['mat-icon', '.mat-icon', '.google-symbols', '.material-icons', '.material-symbols-outlined', 'button', '.mat-mdc-button-touch-target', '.mat-mdc-button-persistent-ripple', '.mat-mdc-card-actions', '.suggestions-container', '.action-button', '.pin-button', '.source-annotation', 'svg', 'hr', '.citation-marker'];
    garbage.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));
    container.querySelectorAll('sup, [data-citation], .citation').forEach(el => { if (/^[\d,\s·]+$/.test(el.textContent.trim()) || el.textContent.trim().length <= 2) el.remove(); });

    const mathSels = '.katex, [data-math], mjx-container, .MathJax, math, .math-inline, .math-block';
    container.querySelectorAll(mathSels).forEach(el => {
      if (el.parentElement?.closest(mathSels)) return;
      const latex = extractLatex(el);
      if (latex) {
        const isBlock = isDisplayMode(el);
        const oldFmt = currentFormat;
        if (forceLatex) currentFormat = 'latex';
        const wrapped = wrapFormula(latex, isBlock);
        currentFormat = oldFmt;

        const replacementText = isBlock ? `\n${wrapped.text}\n` : wrapped.text;
        
        if (!forceLatex && wrapped.html && currentFormat === 'mathml') {
          const div = document.createElement('div'); div.innerHTML = wrapped.html;
          if (div.firstElementChild) el.replaceWith(div.firstElementChild); else el.replaceWith(document.createTextNode(replacementText));
        } else {
          el.replaceWith(document.createTextNode(replacementText));
        }
      } else {
        const txt = el.textContent.trim();
        if (txt.length > 0 && !/^[\s·°]+$/.test(txt)) el.replaceWith(document.createTextNode(txt)); else el.remove();
      }
    });
  }

  function handleCopy(event) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const fragment = sel.getRangeAt(0).cloneContents();
    if (!fragment.querySelector('.katex, [data-math], mjx-container, .MathJax, math')) return;

    event.preventDefault();
    const htmlFrag = fragment.cloneNode(true);
    const textFrag = fragment.cloneNode(true);

    replaceFormulasWithLatex(htmlFrag, false);
    const htmlWrapper = document.createElement('div'); htmlWrapper.appendChild(htmlFrag);
    let htmlContent = htmlWrapper.innerHTML;
    if (htmlContent.includes('mml:') || htmlContent.includes('<math')) htmlContent = wrapMathMLForWordHtml(htmlContent);

    replaceFormulasWithLatex(textFrag, true);
    const textWrapper = document.createElement('div'); textWrapper.style.cssText = 'position:fixed;left:-9999px;opacity:0;'; textWrapper.appendChild(textFrag);
    document.body.appendChild(textWrapper);
    const text = (textWrapper.innerText || textWrapper.textContent || '').replace(/[\u00B0\u2022\u2219\u25CF]/g, '').trim();
    document.body.removeChild(textWrapper);

    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', htmlContent);
  }

  async function init() {
    if (isInitialized) return;
    currentFormat = await NLM.Storage.get('formulaCopyFormat') || 'latex';
    NLM.Storage.onChange((changes, area) => { if (area === 'sync' && changes.formulaCopyFormat) currentFormat = changes.formulaCopyFormat.newValue || 'latex'; });
    document.addEventListener('click', handleClick, true);
    document.addEventListener('copy', handleCopy, true);
    isInitialized = true;
  }

  return { init, destroy: () => { document.removeEventListener('click', handleClick, true); document.removeEventListener('copy', handleCopy, true); isInitialized = false; } };
})();
