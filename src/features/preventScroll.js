/**
 * NLM Enhancer 防止自动滚动模块
 * 当 AI 回复生成中用户主动上滚时，暂停自动滚动到底部的行为
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.PreventScroll = (() => {
  const LOG = '[NLM Enhancer PreventScroll]';
  let isEnabled = false;
  let userHasScrolledUp = false;
  let isAIGenerating = false;
  let observer = null;
  let scrollListener = null;
  let rafId = null;

  // 保存原始的 scrollTo / scrollTop 方法
  const originalScrollTo = Element.prototype.scrollTo;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  /**
   * 检测 AI 是否正在生成回复
   * 通过查找"停止生成"按钮或加载指示器来判断
   */
  function checkAIGenerating() {
    const indicators = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[aria-label*="停止"]',
      '.loading-indicator',
      '.generating-indicator',
      '[data-generating="true"]',
      '.streaming',
    ];

    for (const sel of indicators) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return true;
      } catch { /* 跳过无效选择器 */ }
    }
    return false;
  }

  /**
   * 拦截自动滚动
   */
  function patchScrollMethods() {
    // 拦截 scrollTo
    Element.prototype.scrollTo = function (...args) {
      if (isEnabled && userHasScrolledUp && isAIGenerating) {
        // 如果用户已上滚且 AI 正在生成，阻止自动滚动
        return;
      }
      return originalScrollTo.apply(this, args);
    };

    // 拦截 scrollIntoView（仅当在聊天区域调用时）
    Element.prototype.scrollIntoView = function (...args) {
      if (isEnabled && userHasScrolledUp && isAIGenerating) {
        return;
      }
      return originalScrollIntoView.apply(this, args);
    };
  }

  function restoreScrollMethods() {
    Element.prototype.scrollTo = originalScrollTo;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  }

  /**
   * 监听用户滚动行为
   */
  function handleScroll(e) {
    if (!isEnabled) return;

    // 检测用户是否手动向上滚动
    const target = e.target;
    if (target === document || target === document.documentElement || target === document.body) {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
      const clientHeight = window.innerHeight;

      // 如果不在底部附近（>100px）则认为用户上滚了
      userHasScrolledUp = (scrollHeight - scrollTop - clientHeight) > 100;
    } else if (target instanceof HTMLElement) {
      userHasScrolledUp = (target.scrollHeight - target.scrollTop - target.clientHeight) > 100;
    }

    // 如果用户滚回底部，重置标记
    if (!userHasScrolledUp) {
      userHasScrolledUp = false;
    }
  }

  /**
   * 定期检测 AI 生成状态
   */
  function startGeneratingDetection() {
    const check = () => {
      isAIGenerating = checkAIGenerating();

      // 如果 AI 停止生成，重置用户滚动标记
      if (!isAIGenerating) {
        userHasScrolledUp = false;
      }

      rafId = requestAnimationFrame(check);
    };
    rafId = requestAnimationFrame(check);
  }

  function stopGeneratingDetection() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // === 公开 API ===
  async function init() {
    isEnabled = await NLM.Storage.get('preventScrollEnabled');

    if (isEnabled) {
      patchScrollMethods();
      startGeneratingDetection();
    }

    // 滚动监听始终激活（开销低）
    scrollListener = handleScroll;
    window.addEventListener('scroll', scrollListener, { capture: true, passive: true });

    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.preventScrollEnabled) {
        isEnabled = changes.preventScrollEnabled.newValue === true;
        if (isEnabled) {
          patchScrollMethods();
          startGeneratingDetection();
        } else {
          restoreScrollMethods();
          stopGeneratingDetection();
          userHasScrolledUp = false;
        }
        console.log(LOG, isEnabled ? '已启用' : '已禁用');
      }
    });

    console.log(LOG, '已初始化', isEnabled ? '(已启用)' : '(未启用)');
  }

  function destroy() {
    restoreScrollMethods();
    stopGeneratingDetection();
    if (scrollListener) {
      window.removeEventListener('scroll', scrollListener, { capture: true });
    }
    isEnabled = false;
    userHasScrolledUp = false;
  }

  return { init, destroy };
})();
