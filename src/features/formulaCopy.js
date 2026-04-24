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
  let katexLoaded = false;

  const I18N = {
    copied: '✓ 公式已复制',
    failed: '✗ 复制失败',
    noLatex: '✗ 无法提取源码',
  };

  // ========================================================
  // 公式查找与 LaTeX 提取（核心逻辑）
  // ========================================================

  /**
   * 从点击目标向上查找最近的公式容器
   */
  function findMathElement(target) {
    // 尝试多种选择器向上查找
    const selectors = [
      '.katex',            // KaTeX 渲染根
      '.katex-display',    // KaTeX 块级公式
      '[data-math]',       // Gemini 风格
      'mjx-container',     // MathJax 3
      '.MathJax',          // MathJax 2
      '.math-inline',      // 通用行内公式
      '.math-block',       // 通用块级公式
    ];

    for (const sel of selectors) {
      const found = target.closest(sel);
      if (found) return found;
    }

    return null;
  }

  /**
   * 从公式元素中提取 LaTeX 源码
   * 采用多种策略兼容不同渲染引擎和 DOM 结构
   */
  function extractLatex(element) {
    // === 策略1: data-math 属性 ===
    const dataMath = element.getAttribute('data-math');
    if (dataMath) return dataMath;

    // === 策略2: KaTeX annotation 元素 ===
    const annotationSelectors = [
      'annotation[encoding="application/x-tex"]',
      'annotation[encoding="application/x-latex"]',
      'annotation',
    ];

    for (const sel of annotationSelectors) {
      try {
        const ann = element.querySelector(sel);
        if (ann?.textContent?.trim()) {
          return ann.textContent.trim();
        }
      } catch { /* 跳过选择器错误 */ }
    }

    // === 策略3: 通过 .katex-mathml 内的 math 元素 ===
    const katexMathml = element.querySelector('.katex-mathml');
    if (katexMathml) {
      const mathEl = katexMathml.querySelector('math');
      if (mathEl) {
        const allChildren = mathEl.getElementsByTagName('*');
        for (const child of allChildren) {
          if (child.tagName.toLowerCase() === 'annotation' ||
              child.localName === 'annotation') {
            const encoding = child.getAttribute('encoding') || '';
            if (encoding.includes('tex') || encoding.includes('latex') || !encoding) {
              const text = child.textContent?.trim();
              if (text) return text;
            }
          }
        }
        const semantics = mathEl.querySelector('semantics');
        if (semantics) {
          const lastChild = semantics.lastElementChild;
          if (lastChild && lastChild.textContent?.trim()) {
            const text = lastChild.textContent.trim();
            if (text.includes('\\') || text.includes('^') || text.includes('_') ||
                text.includes('{') || text.length > 1) {
              return text;
            }
          }
        }
      }
    }

    // === 策略4: MathJax script 元素 ===
    const script = element.querySelector(
      'script[type="math/tex"], script[type="math/tex; mode=display"]'
    );
    if (script?.textContent) return script.textContent.trim();

    // === 策略5: data-latex 属性（MathJax 3） ===
    const dataLatex = element.getAttribute('data-latex') ||
                      element.querySelector('[data-latex]')?.getAttribute('data-latex');
    if (dataLatex) return dataLatex;

    return null;
  }

  /**
   * 将 MathML 节点转换为 LaTeX 字符串（简化版）
   */
  function convertMathmlToLatex(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.children);
    const parse = (n) => convertMathmlToLatex(n);
    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': return children.map(parse).join('');
      case 'mi': return node.textContent.trim();
      case 'mn': return node.textContent.trim();
      case 'mo': return node.textContent.trim();
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
    if (!window.temml) {
      console.warn(LOG, 'temml 未加载');
      return null;
    }
    try {
      return window.temml.renderToString(latex, {
        displayMode: isBlock,
        xml: true,
        annotate: false,
        throwOnError: true,
      });
    } catch (e) {
      console.warn(LOG, 'temml 渲染失败', e);
      return null;
    }
  }

  function stripMathMLAnnotations(mathml) {
    return mathml
      .replace(/<annotation(?:-xml)?[\s\S]*?<\/annotation(?:-xml)?>/g, '')
      .replace(/<semantics>\s*([\s\S]*?)\s*<\/semantics>/g, '$1');
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
    
    // 清理
    for (const ann of Array.from(root.getElementsByTagName('annotation'))) ann.parentNode?.removeChild(ann);
    for (const annXml of Array.from(root.getElementsByTagName('annotation-xml'))) annXml.parentNode?.removeChild(annXml);
    
    const semantics = Array.from(root.getElementsByTagName('semantics')).find(node => node.parentElement === root);
    if (semantics) {
      const presentation = semantics.firstElementChild;
      if (presentation) {
        while (root.firstChild) root.removeChild(root.firstChild);
        root.appendChild(presentation);
      }
    }

    if (root.hasAttribute('class')) root.removeAttribute('class');
    if (root.hasAttribute('style')) root.removeAttribute('style');
    for (const el of Array.from(root.getElementsByTagName('*'))) {
      if (el.hasAttribute('class')) el.removeAttribute('class');
      if (el.hasAttribute('style')) el.removeAttribute('style');
    }

    const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
    const outputRoot = output.documentElement;
    for (const attr of Array.from(root.attributes)) {
      if (attr.name.startsWith('xmlns')) continue;
      outputRoot.setAttribute(attr.name, attr.value);
    }
    for (const child of Array.from(root.childNodes)) {
      outputRoot.appendChild(cloneNodeWithMmlPrefix(output, child));
    }
    return new XMLSerializer().serializeToString(outputRoot);
  }

  function cloneNodeWithMmlPrefix(targetDoc, sourceNode) {
    if (sourceNode.nodeType === Node.TEXT_NODE) return targetDoc.createTextNode(sourceNode.nodeValue ?? '');
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return targetDoc.importNode(sourceNode, true);
    const ns = sourceNode.namespaceURI;
    const localName = sourceNode.localName;
    const isMathML = (ns === MATHML_NS || ns === null);
    const qualifiedName = isMathML ? `mml:${localName}` : sourceNode.tagName;
    const el = isMathML ? targetDoc.createElementNS(MATHML_NS, qualifiedName) : targetDoc.createElement(qualifiedName);
    for (const attr of Array.from(sourceNode.attributes)) {
      if (attr.name.startsWith('xmlns')) continue;
      el.setAttribute(attr.name, attr.value);
    }
    for (const child of Array.from(sourceNode.childNodes)) {
      el.appendChild(cloneNodeWithMmlPrefix(targetDoc, child));
    }
    return el;
  }

  function wrapMathMLForWordHtml(mathml) {
    return [
      `<html xmlns:mml="${MATHML_NS}">`,
      '<head><meta charset="utf-8"></head>',
      '<body><!--StartFragment-->',
      mathml,
      '<!--EndFragment--></body></html>',
    ].join('');
  }

  function isDisplayMode(element) {
    if (element.closest('.katex-display')) return true;
    if (element.closest('.math-block')) return true;
    if (element.querySelector('math[display="block"]')) return true;
    return false;
  }

  function stripDelimiters(formula) {
    const t = formula.trim();
    if (t.startsWith('$$') && t.endsWith('$$')) return t.slice(2, -2);
    if (t.startsWith('$') && t.endsWith('$')) return t.slice(1, -1);
    return formula;
  }

  function wrapFormula(formula, isBlock) {
    const raw = stripDelimiters(formula);
    const result = { text: '', html: '' };
    switch (currentFormat) {
      case 'mathml': {
        const rawMathML = latexToMathML(raw, isBlock);
        if (rawMathML) {
          const sanitized = stripMathMLAnnotations(rawMathML);
          const namespaced = ensureMathMLNamespace(sanitized);
          const wordMathML = toWordMathML(namespaced);
          result.text = wordMathML;
          result.html = wordMathML;
        } else {
          result.text = isBlock ? `$$${raw}$$` : `$${raw}$`;
        }
        break;
      }
      case 'no-dollar': result.text = raw; break;
      case 'notion': result.text = `$$${raw}$$`; break;
      case 'latex': default: result.text = isBlock ? `$$${raw}$$` : `$${raw}$`; break;
    }
    return result;
  }

  async function copyToClipboard(text, html) {
    try {
      if (navigator.clipboard?.write) {
        const items = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
        if (html) {
          let finalHtml = html;
          if (html.includes('mml:') || html.includes('<math')) finalHtml = wrapMathMLForWordHtml(html);
          items['text/html'] = new Blob([finalHtml], { type: 'text/html' });
          if (finalHtml.includes(`xmlns:mml="${MATHML_NS}"`)) {
            items['application/mathml+xml'] = new Blob([text], { type: 'application/mathml+xml' });
          }
        }
        try {
          await navigator.clipboard.write([new ClipboardItem(items)]);
          return true;
        } catch (e) {
          return copyToClipboardLegacy(text);
        }
      }
      return copyToClipboardLegacy(text);
    } catch (e) {
      return false;
    }
  }

  function copyToClipboardLegacy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function handleClick(event) {
    const target = event.target;
    const mathEl = findMathElement(target);
    if (!mathEl) return;
    event.preventDefault();
    event.stopPropagation();
    const latex = extractLatex(mathEl);
    if (!latex) {
      NLM.DOM.showToast(I18N.noLatex, event.clientX, event.clientY, false);
      return;
    }
    const isBlock = isDisplayMode(mathEl);
    const { text, html } = wrapFormula(latex, isBlock);
    const success = await copyToClipboard(text, html);
    if (success) {
      mathEl.classList.add('nlm-formula-clicked');
      setTimeout(() => mathEl.classList.remove('nlm-formula-clicked'), 600);
    }
    NLM.DOM.showToast(success ? I18N.copied : I18N.failed, event.clientX, event.clientY, success);
  }

  function replaceFormulasWithLatex(container) {
    container.querySelectorAll('mat-icon, .mat-icon, .google-symbols, .mat-mdc-button-touch-target, .mat-mdc-button-persistent-ripple').forEach(el => el.remove());
    container.querySelectorAll('.mat-mdc-card-actions, .suggestions-container, .action-button, .pin-button').forEach(el => el.remove());

    container.querySelectorAll('.katex').forEach((katexEl) => {
      const latex = extractLatex(katexEl);
      if (latex) {
        const isBlock = katexEl.closest('.katex-display') !== null;
        const wrapped = wrapFormula(latex, isBlock);
        if (wrapped.html) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = wrapped.html;
          if (tempDiv.firstElementChild) katexEl.replaceWith(tempDiv.firstElementChild);
          else katexEl.replaceWith(document.createTextNode(wrapped.text));
        } else {
          katexEl.replaceWith(document.createTextNode(wrapped.text || (isBlock ? `$$${latex}$$` : `$${latex}$`)));
        }
      }
    });

    container.querySelectorAll('[data-math]').forEach((el) => {
      const latex = el.getAttribute('data-math');
      if (latex) {
        const isBlock = el.closest('.math-block') !== null;
        const wrapped = wrapFormula(latex, isBlock);
        if (wrapped.html) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = wrapped.html;
          if (tempDiv.firstElementChild) el.replaceWith(tempDiv.firstElementChild);
          else el.replaceWith(document.createTextNode(wrapped.text));
        } else {
          el.replaceWith(document.createTextNode(wrapped.text || (isBlock ? `$$${latex}$$` : `$${latex}$`)));
        }
      }
    });
  }

  function cleanExtractedText(text) {
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function handleCopy(event) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const hasMath = fragment.querySelector('.katex, [data-math], mjx-container, .MathJax');
    if (!hasMath) return;

    event.preventDefault();
    const htmlFragment = fragment.cloneNode(true);
    const textFragment = fragment.cloneNode(true);

    replaceFormulasWithLatex(htmlFragment);
    const htmlWrapper = document.createElement('div');
    htmlWrapper.appendChild(htmlFragment);
    htmlWrapper.querySelectorAll('sup, [data-citation], .citation, .source-annotation').forEach(el => el.remove());
    let htmlContent = htmlWrapper.innerHTML;
    if (htmlContent.includes('mml:') || htmlContent.includes('<math')) htmlContent = wrapMathMLForWordHtml(htmlContent);

    const oldFormat = currentFormat;
    currentFormat = 'latex';
    replaceFormulasWithLatex(textFragment);
    currentFormat = oldFormat;

    const textWrapper = document.createElement('div');
    textWrapper.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
    textWrapper.appendChild(textFragment);
    
    textWrapper.querySelectorAll('strong, b').forEach(el => {
      const s = document.createElement('span'); s.textContent = `**${el.textContent}**`; el.replaceWith(s);
    });
    textWrapper.querySelectorAll('em, i').forEach(el => {
      const s = document.createElement('span'); s.textContent = `*${el.textContent}*`; el.replaceWith(s);
    });
    
    document.body.appendChild(textWrapper);
    const processedText = textWrapper.innerText || textWrapper.textContent || '';
    document.body.removeChild(textWrapper);

    event.clipboardData.setData('text/plain', cleanExtractedText(processedText));
    event.clipboardData.setData('text/html', htmlContent);
  }

  async function init() {
    if (isInitialized) return;
    currentFormat = await NLM.Storage.get('formulaCopyFormat') || 'latex';
    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.formulaCopyFormat) currentFormat = changes.formulaCopyFormat.newValue || 'latex';
    });
    document.addEventListener('click', handleClick, true);
    document.addEventListener('copy', handleCopy, true);
    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (!isInitialized) return;
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('copy', handleCopy, true);
    isInitialized = false;
  }

  return { init, destroy, extractLatex, findMathElement, replaceFormulasWithLatex };
})();
