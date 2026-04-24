/**
 * NotebookLM++ 对话时间轴导航模块
 * 在页面右侧显示圆点时间轴，每个圆点对应一轮对话，点击可快速跳转
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.Timeline = (() => {
  const LOG = '[NLM++ Timeline]';

  let timelineBar = null;
  let tooltip = null;
  let observer = null;
  let resizeObserver = null;
  let isInitialized = false;

  /**
   * 查找所有对话轮次的容器元素
   */
  function findConversationTurns() {
    const messages = NLM.DOM.findAllMessages();
    const turns = [];
    
    messages.forEach((msg, index) => {
      turns.push({
        index: index,
        element: msg.element,
        text: (msg.text || '').substring(0, 60).trim() || (msg.type === 'user' ? `对话 ${index+1}` : `回复 ${index+1}`),
        type: msg.type
      });
    });

    return turns;
  }

  /**
   * 创建时间轴 UI
   */
  function createTimeline() {
    // 清除旧的
    if (timelineBar) timelineBar.remove();
    if (tooltip) tooltip.remove();

    timelineBar = document.createElement('div');
    timelineBar.className = 'nlm-timeline-bar';

    tooltip = document.createElement('div');
    tooltip.className = 'nlm-timeline-tooltip nlm-hidden';
    document.body.appendChild(tooltip);

    document.body.appendChild(timelineBar);
  }

  /**
   * 动态更新时间轴位置，贴近聊天主体内容区
   */
  function updatePosition() {
    if (!timelineBar) return;
    const chatArea = document.querySelector('.chat-panel-content') || document.querySelector('main');
    if (chatArea) {
      const rect = chatArea.getBoundingClientRect();
      const leftPos = rect.right + 10;
      // 避免超出屏幕边界
      if (leftPos + 40 < window.innerWidth) {
        timelineBar.style.left = `${leftPos}px`;
        timelineBar.style.right = 'auto';
      } else {
        timelineBar.style.right = '8px';
        timelineBar.style.left = 'auto';
      }
      timelineBar.style.top = '50%';
      timelineBar.style.transform = 'translateY(-50%)';
    } else {
      timelineBar.style.right = '8px';
      timelineBar.style.top = '50%';
      timelineBar.style.transform = 'translateY(-50%)';
    }
  }

  /**
   * 渲染时间轴圆点
   */
  function renderDots() {
    if (!timelineBar) return;

    const turns = findConversationTurns();
    timelineBar.innerHTML = '';

    if (turns.length < 2) {
      timelineBar.style.display = 'none';
      return;
    }
    timelineBar.style.display = '';

    updatePosition();

    turns.forEach((turn) => {
      const dot = document.createElement('div');
      dot.className = `nlm-timeline-dot ${turn.type === 'user' ? 'nlm-dot-user' : 'nlm-dot-model'}`;
      dot.dataset.index = turn.index;

      // 悬停显示预览
      dot.addEventListener('mouseenter', (e) => {
        tooltip.textContent = turn.text;
        tooltip.classList.remove('nlm-hidden');
        const rect = dot.getBoundingClientRect();
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.right = `${window.innerWidth - rect.left + 12}px`;
      });

      dot.addEventListener('mouseleave', () => {
        tooltip.classList.add('nlm-hidden');
      });

      // 点击跳转
      dot.addEventListener('click', () => {
        turn.element.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 高亮闪烁效果
        turn.element.classList.add('nlm-highlight-flash');
        setTimeout(() => turn.element.classList.remove('nlm-highlight-flash'), 1500);
      });

      timelineBar.appendChild(dot);
    });

    updateActiveDot();
  }

  /**
   * 根据当前滚动位置更新活跃圆点
   */
  function updateActiveDot() {
    if (!timelineBar) return;

    const turns = findConversationTurns();
    const dots = timelineBar.querySelectorAll('.nlm-timeline-dot');
    if (dots.length === 0) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const viewportCenter = scrollTop + window.innerHeight / 3;

    let activeIndex = 0;
    turns.forEach((turn, i) => {
      const rect = turn.element.getBoundingClientRect();
      const elementTop = rect.top + scrollTop;
      if (elementTop <= viewportCenter) {
        activeIndex = i;
      }
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('nlm-dot-active', i === activeIndex);
    });
  }

  // === 公开 API ===
  function init() {
    if (isInitialized) return;

    createTimeline();
    renderDots();

    // 监听 DOM 变化以捕获新消息
    observer = NLM.DOM.createDebouncedObserver(() => {
      renderDots();
    }, 1000);

    observer.observe(document.body, { childList: true, subtree: true });

    // 滚动时更新活跃圆点
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (scrollTimer) cancelAnimationFrame(scrollTimer);
      scrollTimer = requestAnimationFrame(updateActiveDot);
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (scrollTimer) cancelAnimationFrame(scrollTimer);
      scrollTimer = requestAnimationFrame(updatePosition);
    }, { passive: true });

    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (observer) observer.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    if (timelineBar) timelineBar.remove();
    if (tooltip) tooltip.remove();
    timelineBar = null;
    tooltip = null;
    observer = null;
    isInitialized = false;
  }

  return { init, destroy, refresh: renderDots };
})();
