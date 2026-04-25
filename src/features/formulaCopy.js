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



  function toWordMathML(mathml) {
    try {
      const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
      if (parsed.getElementsByTagName('parsererror').length > 0) return mathml;
      const root = parsed.documentElement;
      
      // 1. 递归移除所有 annotation 和 semantics (只保留演示内容)
      const annotations = Array.from(root.querySelectorAll('annotation, annotation-xml'));
      annotations.forEach(a => a.parentNode?.removeChild(a));
      
      const semantics = Array.from(root.querySelectorAll('semantics'));
      semantics.forEach(s => {
        const pres = s.firstElementChild;
        if (pres) s.replaceWith(pres);
        else s.parentNode?.removeChild(s);
      });

      // 2. 创建带 mml 前缀的新文档
      const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
      const outRoot = output.documentElement;
      
      // 复制根属性 (过滤 class, style 和 xmlns)
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
    // 过滤属性，Word 不喜欢 MathML 带有 class 或 style
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
    // 强化正则：彻底剥离可能存在的包装符，兼容首尾附带的空格
    const raw = formula.trim().replace(/^(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))$/g, '').trim();
    if (!raw) return { text: '', html: '' };

    const result = { text: '', html: '' };
    
    // 模式识别与转换
    switch (currentFormat) {
      case 'notion':
        // Notion 语法强制要求所有块/行公式均使用 $$ 包裹
        result.text = `$$${raw}$$`;
        break;

      case 'no-dollar':
        // 纯源码输出
        result.text = raw;
        break;

      case 'mathml':
        const mml = latexToMathML(raw, isBlock);
        if (mml) {
          const wordMml = toWordMathML(mml);
          // 纯文本：使用 Word MML，适配普通粘贴选项
          result.text = wordMml; 
          
          // HTML：强行插入 xmlns 属性，防止 Word 剥离未声明的 <math> 标签
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
        // 修正为标准 LaTeX 语法：行内 $...$, 块级 \[...\]
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
    
    // 如果是 MathML 模式且生成成功，我们将 MathML 字符串作为 plainText 的一部分（或根据 copyToClipboard 处理）
    // 但通常用户希望点击复制的是渲染后的“可粘贴”内容
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

        // 如果是处理 HTML 剪贴板且格式为 MathML，使用文本占位符替换，规避 DOM 序列化破坏
        if (isHtmlClipboard && wrapped.html && currentFormat === 'mathml') {
          const ph = `___MATHML_PLACEHOLDER_${counter++}___`;
          placeholders[ph] = wrapped.html;
          el.replaceWith(document.createTextNode(ph));
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
    const fragment = sel.getRangeAt(0).cloneContents();
    if (!fragment.querySelector('.katex, [data-math], mjx-container, .MathJax, math')) return;

    // 拦截并阻止浏览器的默认复制行为
    event.preventDefault();
    event.stopPropagation();

    const htmlFrag = fragment.cloneNode(true);
    const textFrag = fragment.cloneNode(true);

    // ==========================================
    // 策略调整：整段复制时的格式重载
    // ==========================================
    let effectiveFormat = currentFormat;
    // 纯文本格式在整段复制时，强制降级为 latex（保留 $ 包裹），以免丢失公式边界
    if (effectiveFormat === 'no-dollar') {
      effectiveFormat = 'latex'; 
    }

    const originalFormat = currentFormat;
    currentFormat = effectiveFormat; // 临时覆盖全局格式，让下层逻辑按新策略执行

    let htmlPlaceholders = {};

    if (effectiveFormat === 'latex') {
      // LaTeX 模式：HTML 剪贴板保留旧版清理逻辑，纯文本使用强制 LaTeX
      replaceFormulasWithLatexOld(htmlFrag); 
      replaceFormulasWithLatex(textFrag, { forceLatex: true }); 
    } else {
      // Notion / MathML 模式：正常执行各自的包裹逻辑
      htmlPlaceholders = replaceFormulasWithLatex(htmlFrag, { isHtmlClipboard: true });
      replaceFormulasWithLatex(textFrag, { forceLatex: false });
    }

    currentFormat = originalFormat; // 逻辑执行完毕，恢复全局格式设置

    // 打印当前复制格式，协助调试（建议用户在控制台查看）
    console.log(LOG, 'Copy execution - Effective Format:', effectiveFormat);

    // ==========================================
    // 处理 HTML 剪贴板内容
    // ==========================================
    const htmlWrapper = document.createElement('div');
    // 根节点补充 MML 声明，满足 Word 解析器的规范
    htmlWrapper.setAttribute('xmlns:mml', MATHML_NS);
    htmlWrapper.appendChild(htmlFrag);
    if (effectiveFormat === 'latex') {
      htmlWrapper.querySelectorAll('sup, [data-citation], .citation, .source-annotation').forEach(el => el.remove());
    }
    
    // 使用 outerHTML 以确保包含 xmlns:mml 属性
    let htmlContent = htmlWrapper.outerHTML;
    
    // 还原 MathML 占位符
    for (const [ph, mmlStr] of Object.entries(htmlPlaceholders)) {
      htmlContent = htmlContent.replace(ph, mmlStr);
    }

    // 针对 MathML (Word) 模式优化：将网页软回车转为 Word 硬回车段落
    if (effectiveFormat === 'mathml') {
      // 仅替换 div 内部的 br
      htmlContent = htmlContent.replace(/<br\s*\/?>/gi, '</p><p>');
      // 如果 div 内容不含 p 标签但有文字，尝试包裹一下（可选，这里采用较保守策略）
    }

    // ==========================================
    // 处理纯文本剪贴板内容
    // ==========================================
    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
    textWrapper.appendChild(textFrag);
    document.body.appendChild(textWrapper);
    
    // 提取文本，并移除圆点符号
    let text = (textWrapper.innerText || textWrapper.textContent || '').replace(/[\u00B0\u2022\u2219\u25CF]/g, '');
    document.body.removeChild(textWrapper);

    if (effectiveFormat === 'latex') {
      text = cleanExtractedText(text);
    } else {
      text = text.trim();
    }

    // 恢复严格的同步写入，规避异步丢包及格式篡改
    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData('text/html', htmlContent);
  }

  async function init() {
    if (isInitialized) return;
    
    // 加载初始格式
    const savedFormat = await NLM.Storage.get('formulaCopyFormat');
    if (savedFormat) {
      currentFormat = savedFormat;
    }
    
    // 监听变更
    NLM.Storage.onChange((changes, area) => { 
      if (area === 'sync' && changes.formulaCopyFormat) {
        currentFormat = changes.formulaCopyFormat.newValue || 'latex';
        console.log(LOG, 'Format updated to:', currentFormat);
      } 
    });

    document.addEventListener('click', handleClick, true);
    document.addEventListener('copy', handleCopy, true);
    isInitialized = true;
  }

  return { init, destroy: () => { document.removeEventListener('click', handleClick, true); document.removeEventListener('copy', handleCopy, true); isInitialized = false; } };
})();
