/**
 * NLM Enhancer 对话提问搜索模块
 * 在面板左侧提供搜索图标，展开后可搜索并跳转到历史提问
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.TimelineSearch = (() => {
  const LOG = '[NLM Enhancer TimelineSearch]';

  let triggerIcon = null;
  let searchPanel = null;
  let posTimer = null;
  let isInitialized = false;

  /**
   * 获取所有用户提问
   */
  function getUserQuestions() {
    return NLM.DOM.findAllMessages()
      .filter(msg => msg.type === 'user')
      .map((msg, index) => ({
        index: index + 1,
        text: msg.text,
        element: msg.element
      }));
  }

  /**
   * 创建 UI 元素
   */
  function createUI() {
    if (triggerIcon) return;

    // 创建图标
    triggerIcon = document.createElement('div');
    triggerIcon.className = 'nlm-timeline-search-trigger';
    triggerIcon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
      </svg>
    `;
    triggerIcon.title = '搜索历史提问';
    
    triggerIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    document.body.appendChild(triggerIcon);
  }

  /**
   * 切换面板显示状态
   */
  function togglePanel() {
    if (searchPanel) {
      closePanel();
    } else {
      openPanel();
    }
  }

  /**
   * 打开搜索面板
   */
  function openPanel() {
    if (searchPanel) return;

    searchPanel = document.createElement('div');
    searchPanel.className = 'nlm-timeline-search-panel';
    
    searchPanel.innerHTML = `
      <div class="nlm-search-header">
        <input type="text" placeholder="搜索提问..." class="nlm-search-input" />
      </div>
      <div class="nlm-search-list"></div>
    `;

    document.body.appendChild(searchPanel);

    const input = searchPanel.querySelector('.nlm-search-input');
    input.focus();

    // 搜索事件
    input.addEventListener('input', (e) => {
      renderList(e.target.value);
    });

    // 初始化渲染列表
    renderList();

    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
    
    updatePanelPosition();
  }

  function closePanel() {
    if (searchPanel) searchPanel.remove();
    searchPanel = null;
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (searchPanel && !searchPanel.contains(e.target) && e.target !== triggerIcon) {
      closePanel();
    }
  }

  /**
   * 渲染提问列表
   */
  function renderList(query = '') {
    if (!searchPanel) return;
    const listContainer = searchPanel.querySelector('.nlm-search-list');
    const questions = getUserQuestions();
    
    const filtered = questions.filter(q => 
      q.text.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div class="nlm-search-empty">未找到相关提问</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(q => `
      <div class="nlm-search-item" data-idx="${q.index}">
        <span class="nlm-search-item-num">${q.index}</span>
        <span class="nlm-search-item-text">${NLM.DOM.getInputText({innerText: q.text}).substring(0, 100)}</span>
      </div>
    `).join('');

    // 绑定点击跳转
    listContainer.querySelectorAll('.nlm-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx) - 1;
        const questions = getUserQuestions();
        const target = questions[idx];
        if (target) {
          target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.element.classList.add('nlm-highlight-flash');
          setTimeout(() => target.element.classList.remove('nlm-highlight-flash'), 1500);
          closePanel();
        }
      });
    });
  }

  /**
   * 定位逻辑
   */
  function updatePosition() {
    const chatArea = document.querySelector('.chat-panel-content') || document.querySelector('chat-panel');
    if (chatArea && triggerIcon) {
      const rect = chatArea.getBoundingClientRect();
      
      // 图标贴合在聊天区域左边缘，垂直居中
      triggerIcon.style.left = `${rect.left}px`;
      triggerIcon.style.top = `${rect.top + rect.height / 2}px`;
      triggerIcon.style.display = 'flex';

      if (searchPanel) {
        updatePanelPosition();
      }
    } else if (triggerIcon) {
      triggerIcon.style.display = 'none';
    }
    posTimer = requestAnimationFrame(updatePosition);
  }

  function updatePanelPosition() {
    if (!searchPanel || !triggerIcon) return;
    const iconRect = triggerIcon.getBoundingClientRect();
    // 面板在图标左侧展开（如果空间足够）或图标右侧
    // 用户图中显示面板在图标左侧
    searchPanel.style.left = `${iconRect.left - 360}px`;
    searchPanel.style.top = `${iconRect.top - 200}px`; // 稍微向上偏移以对齐中心
  }

  function init() {
    if (isInitialized) return;
    createUI();
    updatePosition();
    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (triggerIcon) triggerIcon.remove();
    if (searchPanel) searchPanel.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    triggerIcon = null;
    searchPanel = null;
    isInitialized = false;
  }

  return { init, destroy };
})();
