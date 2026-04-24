/**
 * NotebookLM++ 删除/隐藏特定对话轮次模块
 * 允许用户点击垃圾桶图标将某些不要的对话从本地页面隐藏
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.DeleteMessage = (() => {
  const LOG = '[NLM++ DeleteMessage]';
  let observer = null;
  let isInitialized = false;

  function injectDeleteButtons() {
    // 查找包含对话回合的容器
    const pairs = document.querySelectorAll('.chat-message-pair, .individual-message');
    
    pairs.forEach(pair => {
      // 避免重复注入，跳过已经注入过或者已被隐藏的
      if (pair.dataset.hasNlmDelete || pair.style.display === 'none' || pair.classList.contains('nlm-hidden-msg')) {
        return;
      }

      // 如果这个节点是 individual-message，但它被包含在 chat-message-pair 里，
      // 我们优先给顶层 chat-message-pair 注入。所以如果它是子节点则跳过。
      if (pair.classList.contains('individual-message') && pair.closest('.chat-message-pair')) {
        return;
      }

      pair.dataset.hasNlmDelete = 'true';
      pair.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'nlm-delete-msg-btn';
      btn.title = '隐藏本轮对话（仅本地）';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      btn.addEventListener('mouseenter', () => pair.classList.add('nlm-highlight-delete'));
      btn.addEventListener('mouseleave', () => pair.classList.remove('nlm-highlight-delete'));

      btn.onclick = () => {
        if (confirm('是否隐藏此对话回合？（仅在本次页面加载期间隐藏）')) {
          pair.style.display = 'none';
          pair.classList.add('nlm-hidden-msg');
          
          // 如果隐藏了元素，刷新一下时间轴
          setTimeout(() => {
            if (NLM.Timeline && typeof NLM.Timeline.refresh === 'function') {
              NLM.Timeline.refresh();
            }
          }, 50);
        }
      };

      pair.appendChild(btn);
    });
  }

  function init() {
    if (isInitialized) return;

    injectDeleteButtons();

    let debounceTimer;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectDeleteButtons, 800);
    });

    const chatArea = document.querySelector('.chat-panel-content') || document.body;
    observer.observe(chatArea, { childList: true, subtree: true });

    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (observer) observer.disconnect();
    document.querySelectorAll('.nlm-delete-msg-btn').forEach(btn => btn.remove());
    document.querySelectorAll('.nlm-hidden-msg').forEach(el => {
      el.style.display = '';
      el.classList.remove('nlm-hidden-msg');
    });
    isInitialized = false;
  }

  return { init, destroy };
})();
