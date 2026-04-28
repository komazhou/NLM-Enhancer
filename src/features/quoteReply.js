/**
 * NLM Enhancer 选中文本引用回复模块
 * 选中任意文本后弹出"引用"按钮，点击后将文本以【引用内容】格式插入输入框，避免 Markdown 符号被吞噬
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.QuoteReply = (() => {
  const LOG = '[NLM Enhancer QuoteReply]';

  // 引用图标 SVG
  const QUOTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;

  let quoteBtn = null;
  let currentRange = null;
  let isInternalClick = false;
  let scrollRafId = null;
  let debounceTimer = null;

  function createButton() {
    if (quoteBtn) return;
    quoteBtn = document.createElement('div');
    quoteBtn.className = 'nlm-quote-btn nlm-hidden';
    quoteBtn.innerHTML = `${QUOTE_ICON}<span>${NLM.i18n.get('btnQuote')}</span>`;

    quoteBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isInternalClick = true;
      handleQuote();
    });

    document.body.appendChild(quoteBtn);
  }

  function updatePosition() {
    if (!quoteBtn || !currentRange) return;

    const rangeRect = currentRange.getBoundingClientRect();
    const isOffScreen = rangeRect.bottom < 0 || rangeRect.top > window.innerHeight;

    if (isOffScreen) {
      quoteBtn.classList.add('nlm-hidden');
      return;
    }
    quoteBtn.classList.remove('nlm-hidden');

    const btnRect = quoteBtn.getBoundingClientRect();
    const firstRect = (typeof currentRange.getClientRects === 'function'
      ? currentRange.getClientRects()[0]
      : null) || rangeRect;

    const top = firstRect.top - btnRect.height - 12;
    const left = rangeRect.left + rangeRect.width / 2 - btnRect.width / 2;
    const maxLeft = window.innerWidth - btnRect.width - 10;

    quoteBtn.style.top = `${Math.max(10, top)}px`;
    quoteBtn.style.left = `${Math.min(maxLeft, Math.max(10, left))}px`;
  }

  function onScrollOrResize() {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      updatePosition();
      scrollRafId = null;
    });
  }

  function showButton() {
    if (!quoteBtn) createButton();
    updatePosition();
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
  }

  function hideButton() {
    if (quoteBtn) quoteBtn.classList.add('nlm-hidden');
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
  }

  /**
   * 提取选中文本，保留 LaTeX 公式语法，并清理 NotebookLM 的来源标引
   * 复用 FormulaCopy 模块的增强提取逻辑
   */
  function extractTextWithLatex(range) {
    const fragment = range.cloneContents();

    // === 步骤1：移除来源标引 ===
    ['sup', '[data-citation]', '.citation', '.source-annotation',
     'button[class*="citation"]', '[class*="footnote"]', '[class*="superscript"]'
    ].forEach((sel) => {
      try {
        fragment.querySelectorAll(sel).forEach((el) => {
          const text = (el.textContent || '').trim();
          if (/^[\d,\s·]+$/.test(text) || text.length <= 3) {
            el.remove();
          }
        });
      } catch { /* 跳过 */ }
    });

    // === 步骤2：替换公式为 LaTeX ===
    // 使用 FormulaCopy 的 extractLatex 方法（如果已加载）
    const extractFn = NLM.FormulaCopy?.extractLatex || null;

    // 处理 .katex 元素
    fragment.querySelectorAll('.katex').forEach((katexEl) => {
      let latex = null;
      if (extractFn) {
        latex = extractFn(katexEl);
      }
      if (!latex) {
        // 兜底：多种方式查找 annotation
        const ann = katexEl.querySelector('annotation') ||
                    katexEl.querySelector('.katex-mathml annotation');
        if (ann?.textContent) latex = ann.textContent.trim();
      }
      if (!latex) {
        // 再兜底：遍历所有后代
        const allEls = katexEl.getElementsByTagName('*');
        for (const el of allEls) {
          if (el.localName === 'annotation' || el.tagName.toLowerCase() === 'annotation') {
            latex = el.textContent?.trim();
            if (latex) break;
          }
        }
      }

      if (latex) {
        const isBlock = katexEl.closest('.katex-display') !== null;
        katexEl.replaceWith(document.createTextNode(isBlock ? ` \\[${latex}\\] ` : ` $${latex}$ `));
      }
    });

    // 处理 [data-math]
    fragment.querySelectorAll('[data-math]').forEach((el) => {
      const latex = el.getAttribute('data-math');
      if (latex) {
        const isBlock = el.closest('.math-block') !== null;
        el.replaceWith(document.createTextNode(isBlock ? ` \\[${latex}\\] ` : ` $${latex}$ `));
      }
    });

    // 处理 MathJax
    fragment.querySelectorAll('mjx-container').forEach((mjx) => {
      const texEl = mjx.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]');
      if (texEl?.textContent) {
        const isBlock = mjx.getAttribute('display') === 'true';
        mjx.replaceWith(document.createTextNode(
          isBlock ? ` \\[${texEl.textContent.trim()}\\] ` : ` $${texEl.textContent.trim()}$ `
        ));
      }
    });

    // === 步骤3：提取文本 ===
    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none;';
    temp.appendChild(fragment);
    document.body.appendChild(temp);
    let text = temp.innerText ?? temp.textContent ?? '';
    temp.remove();

    // === 步骤4：清理换行 ===
    text = text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(\S)\n(\S)/g, '$1$2')
      .replace(/。\n/g, '。\n\n')
      .replace(/\s*\$\s*/g, ' $')
      .replace(/\$\s+/g, '$')
      .replace(/\s+\$/g, '$')
      .replace(/\$ \$/g, '$$')
      .trim();

    return text;
  }


  function handleQuote() {
    if (!currentRange) return;
    const selectedText = extractTextWithLatex(currentRange).trim();
    if (!selectedText) return;

    const input = NLM.DOM.findChatInput();
    if (!input) {
      console.warn(LOG, '未找到输入框');
      return;
    }

    // 使用明确的中文引用标识和直角引号，避免 > 被编辑器吞噬
    const quoteBody = NLM.i18n.get('quotePrefix') + selectedText
      .split('\n')
      .map((line) => `${NLM.i18n.get('quoteLineWrapOpen')}${line}${NLM.i18n.get('quoteLineWrapClose')}`)
      .join('\n');

    // 插入引用到输入框
    setTimeout(() => {
      NLM.DOM.appendToInput(input, quoteBody + '\n');
      input.focus();
    }, 150);

    hideButton();
    currentRange = null;
    window.getSelection()?.removeAllRanges();
  }

  function handleSelectionChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideButton();
        currentRange = null;
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        hideButton();
        currentRange = null;
        return;
      }

      // 确保选中的是主内容区，而非导航栏等
      const anchor = selection.anchorNode;
      if (!anchor) return;
      const element = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;

      // 排除输入框、导航栏、侧边栏
      if (element?.closest('[contenteditable="true"]') ||
          element?.closest('nav') ||
          element?.closest('[role="navigation"]') ||
          element?.closest('.sidebar') ||
          element?.closest('textarea')) {
        hideButton();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      currentRange = range;
      showButton();
    }, 250);
  }

  function onMouseUp(e) {
    if (isInternalClick) {
      isInternalClick = false;
      return;
    }
    handleSelectionChange();
  }

  function onKeyUp(e) {
    if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
      handleSelectionChange();
    }
  }

  // === 公开 API ===
  function init() {
    createButton();
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    console.log(LOG, '已启动');
  }

  function destroy() {
    hideButton();
    if (debounceTimer) clearTimeout(debounceTimer);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keyup', onKeyUp);
    if (quoteBtn) quoteBtn.remove();
    quoteBtn = null;
  }

  return { init, destroy };
})();
