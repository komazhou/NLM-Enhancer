/**
 * NLM Enhancer 知识购物车模块（暂存与合并导出）
 * 允许用户暂存完整的对话区块（Q+A）到本地存储，支持合并预览导出
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.StashCart = (() => {
  const LOG = '[NLM Enhancer StashCart]';

  let isInitialized = false;
  let observer = null;
  let cartBadge = null;
  let cartPanel = null;
  let posTimer = null;

  // --- 存储 Key 管理 ---

  function getStorageKey() {
    const path = location.pathname.replace(/\/$/, '');
    const safeKey = path.replace(/[^a-zA-Z0-9]/g, '_');
    return `stash${safeKey}`;
  }

  async function loadStashData() {
    const key = getStorageKey();
    const data = await NLM.Storage.getLocal(key);
    return Array.isArray(data) ? data : [];
  }

  async function saveStashData(items) {
    const key = getStorageKey();
    await NLM.Storage.setLocal(key, items);
  }

  // --- 模块二核心：提取完整的 Q+A 对话块 ---

  /**
   * 从按钮所在的消息节点向上查找，抓取完整的"用户提问 + AI 回答"对话块
   * @param {HTMLElement} pair - 按钮所在的消息容器
   * @returns {{userMarkdown: string, modelMarkdown: string, summary: string}}
   */
  function extractFullBlock(pair) {
    let userMarkdown = '';
    let modelMarkdown = '';
    let userHtml = '';
    let modelHtml = '';

    // 策略1: pair 本身是 chat-message-pair，内部包含 user + model
    const userCard = pair.querySelector('.from-user-message-card-content');
    const modelCard = pair.querySelector('.to-user-message-card-content');

    if (userCard && modelCard) {
      const userData = extractNodeData(userCard);
      const modelData = extractNodeData(modelCard);
      userMarkdown = userData.md;
      userHtml = userData.html;
      modelMarkdown = modelData.md;
      modelHtml = modelData.html;
    } else {
      // 策略2: pair 是 individual-message 或单独的 card
      const isUser = pair.classList.contains('from-user-message-card-content') ||
                     pair.querySelector('.from-user-message-card-content, .from-user-container') !== null;

      const currentData = extractNodeData(pair);

      if (isUser) {
        userMarkdown = currentData.md;
        userHtml = currentData.html;
        // 向下查找紧邻的 AI 回复兄弟节点
        let next = pair.nextElementSibling;
        while (next && !isUserNode(next)) {
          if (isModelNode(next)) {
            const nextData = extractNodeData(next);
            modelMarkdown = nextData.md;
            modelHtml = nextData.html;
            break;
          }
          next = next.nextElementSibling;
        }
      } else {
        modelMarkdown = currentData.md;
        modelHtml = currentData.html;
        // 向上查找紧邻的用户提问兄弟节点
        let prev = pair.previousElementSibling;
        while (prev && !isModelNode(prev)) {
          if (isUserNode(prev)) {
            const prevData = extractNodeData(prev);
            userMarkdown = prevData.md;
            userHtml = prevData.html;
            break;
          }
          prev = prev.previousElementSibling;
        }
      }
    }

    // 合并生成摘要（优先用 model 回答的前60字）
    const primaryText = modelMarkdown || userMarkdown;
    let summary = primaryText.substring(0, 60).replace(/\n/g, ' ').trim();
    if (primaryText.length > 60) summary += '…';

    return { userMarkdown, modelMarkdown, userHtml, modelHtml, summary };
  }

  function isUserNode(el) {
    return el.classList.contains('from-user-message-card-content') ||
           el.querySelector('.from-user-message-card-content, .from-user-container') !== null;
  }

  function isModelNode(el) {
    return el.classList.contains('to-user-message-card-content') ||
           el.querySelector('.to-user-message-card-content') !== null ||
           (!isUserNode(el) && el.querySelector('.message-text-content, .message-content'));
  }

  function extractNodeData(node) {
    const contentEl = node.querySelector('.message-text-content, .message-content, .mat-mdc-card-content') || node;
    let cleanHtml = '';
    let markdown = '';
    
    if (NLM.Export && NLM.Export.extractCleanHtml && NLM.Export.htmlToMarkdown) {
      cleanHtml = NLM.Export.extractCleanHtml(contentEl);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanHtml;
      markdown = NLM.Export.htmlToMarkdown(tempDiv);
    } else {
      // 降级
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll('button, mat-icon, .mat-mdc-card-actions, .suggestions-container').forEach(el => el.remove());
      markdown = clone.innerText?.trim() || clone.textContent?.trim() || '';
      cleanHtml = clone.innerHTML;
    }
    return { html: cleanHtml, md: markdown };
  }

  // --- 暂存按钮注入（药丸状） ---

  function injectStashButtons() {
    const pairs = document.querySelectorAll('.chat-message-pair, .individual-message');

    pairs.forEach(pair => {
      if (pair.dataset.hasNlmStash || pair.style.display === 'none' || pair.classList.contains('nlm-hidden-msg')) return;
      if (pair.classList.contains('individual-message') && pair.closest('.chat-message-pair')) return;

      pair.dataset.hasNlmStash = 'true';

      const btn = document.createElement('button');
      btn.className = 'nlm-stash-btn';
      btn.title = NLM.i18n.get('stashTooltip');
      // 药丸状：图标 + 文本
      btn.innerHTML = `${getSvgBookmarkAdd()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnLabel')}</span>`;

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (btn.classList.contains('nlm-stashed')) {
          await unstashMessage(pair, btn);
        } else {
          await stashMessage(pair, btn);
        }
      });

      // 注入到 ActionBar
      const actionBar = pair.querySelector('.mat-mdc-card-actions, .message-actions, [class*="actions"]');
      if (actionBar) {
        actionBar.insertBefore(btn, actionBar.firstChild);
      } else {
        pair.style.position = 'relative';
        btn.classList.add('nlm-stash-btn-absolute');
        pair.appendChild(btn);
      }
    });
  }

  // --- 暂存 / 取消暂存 ---

  async function stashMessage(pair, btn) {
    try {
      const { userMarkdown, modelMarkdown, userHtml, modelHtml, summary } = extractFullBlock(pair);
      if (!userMarkdown && !modelMarkdown) {
        NLM.DOM.showToast(NLM.i18n.get('toastNoConversation'), window.innerWidth / 2, 100, false);
        return;
      }

      // 合并为完整 Markdown
      let fullMarkdown = '';
      if (userMarkdown) fullMarkdown += `## ${NLM.i18n.get('mdRoleUser')}\n\n${userMarkdown}\n\n`;
      if (modelMarkdown) fullMarkdown += `## ${NLM.i18n.get('mdRoleModel')}\n\n${modelMarkdown}`;
      fullMarkdown = fullMarkdown.trim();

      const stashItem = {
        id: `stash_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'block',
        summary,
        markdown: fullMarkdown,
        userMarkdown,
        modelMarkdown,
        userHtml,
        modelHtml,
        timestamp: Date.now()
      };

      const items = await loadStashData();
      items.push(stashItem);
      await saveStashData(items);

      btn.dataset.stashId = stashItem.id;
      btn.classList.add('nlm-stashed');
      btn.innerHTML = `${getSvgBookmarkCheck()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnStashed')}</span>`;

      updateCartCount(items.length);
      const rect = btn.getBoundingClientRect();
      NLM.DOM.showToast(NLM.i18n.get('toastStashed'), rect.left, rect.top);
    } catch (err) {
      console.error(LOG, '暂存失败:', err);
    }
  }

  async function unstashMessage(pair, btn) {
    try {
      const stashId = btn.dataset.stashId;
      if (!stashId) return;

      const items = await loadStashData();
      const filtered = items.filter(item => item.id !== stashId);
      await saveStashData(filtered);

      btn.classList.remove('nlm-stashed');
      btn.innerHTML = `${getSvgBookmarkAdd()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnLabel')}</span>`;
      btn.title = NLM.i18n.get('stashTooltip');
      delete btn.dataset.stashId;

      updateCartCount(filtered.length);
      const rect = btn.getBoundingClientRect();
      NLM.DOM.showToast(NLM.i18n.get('toastUnstashed'), rect.left, rect.top);
    } catch (err) {
      console.error(LOG, '取消暂存失败:', err);
    }
  }

  // --- 全局购物车徽标（锚定主对话栏） ---

  function createCartBadge() {
    if (cartBadge) return;

    cartBadge = document.createElement('button');
    cartBadge.className = 'nlm-cart-badge';
    cartBadge.innerHTML = `
      ${getSvgCart()}
      <span class="nlm-cart-count" style="display:none;">0</span>
    `;
    cartBadge.title = NLM.i18n.get('cartPanelTitle');

    cartBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCartPanel();
    });

    // 挂载到 body，配合 fixed 定位
    document.body.appendChild(cartBadge);
    updatePosition();
  }

  function updatePosition() {
    if (cartBadge) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect && rect.width > 0) {
          const exportBtn = document.querySelector('.nlm-export-btn');
          const exportHeight = exportBtn ? exportBtn.offsetHeight : 0;
          const exportMargin = exportBtn ? 6 : 0;
          
          // 对齐到输入框右侧，预留一点边距
          cartBadge.style.left = (rect.right - 48 - 2) + "px"; 
          // 放在导出按钮上方，保持 12px 间隔
          cartBadge.style.top = (rect.top - exportHeight - exportMargin - 48 - 12) + "px";
        }
      }
    }
    posTimer = requestAnimationFrame(updatePosition);
  }

  function updateCartCount(count) {
    if (!cartBadge) return;
    const countEl = cartBadge.querySelector('.nlm-cart-count');
    if (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'flex' : 'none';
    }
    if (count > 0) {
      cartBadge.classList.add('nlm-cart-bounce');
      setTimeout(() => cartBadge.classList.remove('nlm-cart-bounce'), 400);
    }
  }

  // --- 购物车列表面板（含复选框 + 预览合并） ---

  function toggleCartPanel() {
    if (cartPanel) { closeCartPanel(); return; }
    openCartPanel();
  }

  async function openCartPanel() {
    if (cartPanel) return;
    const items = await loadStashData();

    cartPanel = document.createElement('div');
    cartPanel.className = 'nlm-cart-panel';

    // 头部
    const header = document.createElement('div');
    header.className = 'nlm-cart-panel-header';
    header.innerHTML = `
      <h3>${NLM.i18n.get('cartPanelTitle')}</h3>
      <div class="nlm-cart-header-actions">
        <button class="nlm-cart-action-btn nlm-cart-selectall-btn" title="${NLM.i18n.get('cartSelectAll')}">☑</button>
        <button class="nlm-cart-action-btn nlm-cart-clear-btn" title="${NLM.i18n.get('cartClearAll')}">${getSvgTrash()}</button>
      </div>
    `;

    // 列表
    const list = document.createElement('div');
    list.className = 'nlm-cart-list';

    if (items.length === 0) {
      list.innerHTML = `<div class="nlm-cart-empty">${NLM.i18n.get('cartEmpty')}</div>`;
    } else {
      items.forEach(item => list.appendChild(createCartItemElement(item)));
    }

    // 底部操作栏
    const footer = document.createElement('div');
    footer.className = 'nlm-cart-panel-footer';
    footer.innerHTML = `
      <span class="nlm-cart-selected-count"></span>
      <button class="nlm-cart-preview-btn">${NLM.i18n.get('cartPreviewMerged')}</button>
    `;

    cartPanel.appendChild(header);
    cartPanel.appendChild(list);
    cartPanel.appendChild(footer);
    document.body.appendChild(cartPanel);

    // 事件绑定
    header.querySelector('.nlm-cart-selectall-btn').addEventListener('click', toggleSelectAll);
    header.querySelector('.nlm-cart-clear-btn').addEventListener('click', clearAllStashed);
    footer.querySelector('.nlm-cart-preview-btn').addEventListener('click', previewMergedContent);

    updateSelectedCount();

    setTimeout(() => document.addEventListener('click', handleOutsideClick), 100);
  }

  function closeCartPanel() {
    if (cartPanel) {
      cartPanel.classList.add('nlm-cart-panel-closing');
      setTimeout(() => { if (cartPanel) cartPanel.remove(); cartPanel = null; }, 200);
    }
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (cartPanel && !cartPanel.contains(e.target) && !cartBadge.contains(e.target)) {
      closeCartPanel();
    }
  }

  function createCartItemElement(item) {
    const el = document.createElement('div');
    el.className = 'nlm-cart-item';
    el.dataset.stashId = item.id;

    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    el.innerHTML = `
      <label class="nlm-cart-item-check">
        <input type="checkbox" checked data-id="${item.id}">
        <span class="nlm-cart-checkmark"></span>
      </label>
      <div class="nlm-cart-item-body">
        <div class="nlm-cart-item-header">
          <span class="nlm-cart-item-role">💬</span>
          <span class="nlm-cart-item-time">${timeStr}</span>
          <button class="nlm-cart-item-delete" title="${NLM.i18n.get('btnDelete')}">×</button>
        </div>
        <div class="nlm-cart-item-summary">${escapeHtml(item.summary)}</div>
      </div>
    `;

    // Checkbox 变化时更新计数
    el.querySelector('input[type="checkbox"]').addEventListener('change', updateSelectedCount);

    // 删除单条
    el.querySelector('.nlm-cart-item-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const items = await loadStashData();
      const filtered = items.filter(i => i.id !== item.id);
      await saveStashData(filtered);
      updateCartCount(filtered.length);

      // 恢复页面按钮
      const pageBtn = document.querySelector(`.nlm-stash-btn[data-stash-id="${item.id}"]`);
      if (pageBtn) {
        pageBtn.classList.remove('nlm-stashed');
        pageBtn.innerHTML = `${getSvgBookmarkAdd()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnLabel')}</span>`;
        delete pageBtn.dataset.stashId;
      }

      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => {
        el.remove();
        const listEl = cartPanel?.querySelector('.nlm-cart-list');
        if (listEl && listEl.querySelectorAll('.nlm-cart-item').length === 0) {
          listEl.innerHTML = `<div class="nlm-cart-empty">${NLM.i18n.get('cartEmpty')}</div>`;
        }
        updateSelectedCount();
      }, 200);
    });

    return el;
  }

  function toggleSelectAll() {
    if (!cartPanel) return;
    const checkboxes = cartPanel.querySelectorAll('.nlm-cart-item input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateSelectedCount();
  }

  function updateSelectedCount() {
    if (!cartPanel) return;
    const checkboxes = cartPanel.querySelectorAll('.nlm-cart-item input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    const total = checkboxes.length;
    const countEl = cartPanel.querySelector('.nlm-cart-selected-count');
    if (countEl) countEl.textContent = `${checked}/${total}`;
    const previewBtn = cartPanel.querySelector('.nlm-cart-preview-btn');
    if (previewBtn) previewBtn.disabled = checked === 0;
  }

  // --- 模块三核心：预览合并内容（复用 export.js 预览窗口） ---

  async function previewMergedContent() {
    if (!cartPanel) return;

    const checkedIds = new Set();
    cartPanel.querySelectorAll('.nlm-cart-item input[type="checkbox"]:checked').forEach(cb => {
      checkedIds.add(cb.dataset.id);
    });

    if (checkedIds.size === 0) return;

    const allItems = await loadStashData();
    const selectedItems = allItems.filter(item => checkedIds.has(item.id));

    // 关闭面板
    closeCartPanel();

    // 复用 export.js 的预览窗口
    if (NLM.Export && NLM.Export.openStashPreview) {
      NLM.Export.openStashPreview(selectedItems);
    } else {
      console.error(LOG, 'NLM.Export.openStashPreview 不可用');
    }
  }

  async function clearAllStashed() {
    const items = await loadStashData();
    if (items.length === 0) return;

    await saveStashData([]);
    updateCartCount(0);

    document.querySelectorAll('.nlm-stash-btn.nlm-stashed').forEach(btn => {
      btn.classList.remove('nlm-stashed');
      btn.innerHTML = `${getSvgBookmarkAdd()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnLabel')}</span>`;
      delete btn.dataset.stashId;
    });

    if (cartPanel) {
      const listEl = cartPanel.querySelector('.nlm-cart-list');
      if (listEl) listEl.innerHTML = `<div class="nlm-cart-empty">${NLM.i18n.get('cartEmpty')}</div>`;
      updateSelectedCount();
    }

    const rect = cartBadge.getBoundingClientRect();
    NLM.DOM.showToast(NLM.i18n.get('toastCartCleared'), rect.left, rect.top);
  }

  // --- 已暂存状态恢复 ---

  async function restoreStashedState() {
    const items = await loadStashData();
    if (items.length === 0) return;
    updateCartCount(items.length);

    const allBtns = document.querySelectorAll('.nlm-stash-btn');
    allBtns.forEach(btn => {
      const pair = btn.closest('.chat-message-pair, .individual-message');
      if (!pair) return;

      const contentEl = pair.querySelector('.message-text-content, .message-content, .mat-mdc-card-content') || pair;
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll('button, mat-icon, .mat-mdc-card-actions, .suggestions-container, .nlm-stash-btn').forEach(el => el.remove());
      const text = (clone.innerText?.trim() || '').substring(0, 60).replace(/\n/g, ' ').trim();

      const matchedItem = items.find(item => {
        const storedSummary = item.summary.replace(/…$/, '');
        return text.startsWith(storedSummary) || storedSummary.startsWith(text.substring(0, 40));
      });

      if (matchedItem) {
        btn.classList.add('nlm-stashed');
        btn.innerHTML = `${getSvgBookmarkCheck()}<span class="nlm-stash-label">${NLM.i18n.get('stashBtnStashed')}</span>`;
        btn.dataset.stashId = matchedItem.id;
      }
    });
  }

  // --- SVG 图标 ---

  function getSvgBookmarkAdd() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      <line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/>
    </svg>`;
  }

  function getSvgBookmarkCheck() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      <polyline points="9 11 11 13 15 9" stroke="#fff" stroke-width="2" fill="none"/>
    </svg>`;
  }

  function getSvgCart() {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>`;
  }

  function getSvgTrash() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 公共 API ---

  function init() {
    if (isInitialized) return;
    createCartBadge();
    injectStashButtons();

    observer = new MutationObserver(() => {
      clearTimeout(observer._debounceTimer);
      observer._debounceTimer = setTimeout(injectStashButtons, 800);
    });
    const chatArea = document.querySelector('.chat-panel-content') || document.body;
    observer.observe(chatArea, { childList: true, subtree: true });

    setTimeout(restoreStashedState, 500);
    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (observer) { clearTimeout(observer._debounceTimer); observer.disconnect(); }
    if (posTimer) cancelAnimationFrame(posTimer);
    document.querySelectorAll('.nlm-stash-btn').forEach(btn => btn.remove());
    document.querySelectorAll('[data-has-nlm-stash]').forEach(el => delete el.dataset.hasNlmStash);
    if (cartBadge) { cartBadge.remove(); cartBadge = null; }
    if (cartPanel) { cartPanel.remove(); cartPanel = null; }
    document.removeEventListener('click', handleOutsideClick);
    observer = null;
    isInitialized = false;
  }

  return { init, destroy };
})();
