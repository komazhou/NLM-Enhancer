/**
 * NLM Enhancer 历史问题记录模块 (v1.3.0.3 增强版)
 * 采用统一的左下固定、右上拉伸交互规范
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.QuestionHistory = (() => {
  const LOG = '[NLM Enhancer QuestionHistory]';
  const MAX_HISTORY = 50;

  let isInitialized = false;
  let triggerBtn = null;
  let panel = null;
  let historyData = [];
  let posTimer = null;
  let panelSize = { width: 380, height: 480 };

  async function loadData() {
    try {
      const data = await NLM.Storage.getLocal('nlm_question_history');
      historyData = Array.isArray(data) ? data : [];
      const sizeData = await NLM.Storage.get('promptVaultHistorySize');
      if (sizeData) panelSize = sizeData;
    } catch {
      historyData = [];
    }
  }

  async function saveData() {
    await NLM.Storage.setLocal('nlm_question_history', historyData);
    await NLM.Storage.set('promptVaultHistorySize', panelSize);
  }

  async function recordQuestion(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const idx = historyData.findIndex(item => item.text === trimmedText);
    if (idx !== -1) historyData.splice(idx, 1);
    historyData.unshift({ id: Date.now().toString(), text: trimmedText, timestamp: Date.now() });
    if (historyData.length > MAX_HISTORY) historyData = historyData.slice(0, MAX_HISTORY);
    await saveData();
    if (panel) renderPanelContent();
  }

  function setupCapture() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const input = NLM.DOM.findChatInput();
        if (e.target === input) {
          const text = NLM.DOM.getInputText(input);
          if (text) recordQuestion(text);
        }
      }
    }, true);
    document.addEventListener('click', (e) => {
      const sendBtn = NLM.DOM.findSendButton();
      if (sendBtn && (sendBtn === e.target || sendBtn.contains(e.target))) {
        const input = NLM.DOM.findChatInput();
        if (input) {
          const text = NLM.DOM.getInputText(input);
          if (text) recordQuestion(text);
        }
      }
    }, true);
  }

  function createTriggerButton() {
    if (triggerBtn) return;
    triggerBtn = document.createElement('button');
    triggerBtn.className = 'nlm-history-trigger';
    triggerBtn.innerHTML = `🕒<span class="nlm-trigger-label">${NLM.i18n.get('questionHistoryTitle')}</span>`;
    triggerBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    document.body.appendChild(triggerBtn);
  }

  function updateBtnPosition() {
    if (triggerBtn) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.top > 0) {
          const promptBtn = document.querySelector('.nlm-prompt-trigger');
          const offset = promptBtn ? promptBtn.offsetWidth + 8 : 100;
          triggerBtn.style.left = `${rect.left + offset}px`;
          triggerBtn.style.top = `${rect.top - triggerBtn.offsetHeight}px`;
        }
      }
    }
    posTimer = requestAnimationFrame(updateBtnPosition);
  }

  function togglePanel() { panel ? closePanel() : openPanel(); }

  function openPanel() {
    if (panel) return;
    // 互斥逻辑：打开历史记录时，关闭提示词库和购物车
    if (NLM.PromptVault && NLM.PromptVault.closePanel) NLM.PromptVault.closePanel();
    if (NLM.StashCart && NLM.StashCart.closeCartPanel) NLM.StashCart.closeCartPanel();
    panel = document.createElement('div');
    panel.className = 'nlm-prompt-panel nlm-history-panel';
    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      const bottomOffset = window.innerHeight - rect.top; // 精准对齐按钮上沿
      panel.style.left = `${rect.left}px`; // 精准对齐按钮左沿
      panel.style.bottom = `${bottomOffset}px`;
      panel.style.width = `${panelSize.width}px`;
      panel.style.height = `${panelSize.height}px`;
    }
    renderPanelContent();
    document.body.appendChild(panel);
    setupResizeHandler();
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 100);
  }

  function setupResizeHandler() {
    const handle = panel.querySelector('.nlm-resize-handle-tr');
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    handle.addEventListener('mousedown', (e) => {
      isResizing = true; startX = e.clientX; startY = e.clientY;
      startWidth = panel.offsetWidth; startHeight = panel.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
    function onMouseMove(e) {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = startY - e.clientY;
      const newW = Math.max(300, startWidth + dx);
      const newH = Math.max(300, startHeight + dy);
      panel.style.width = `${newW}px`;
      panel.style.height = `${newH}px`;
      panelSize = { width: newW, height: newH };
    }
    function onMouseUp() {
      if (isResizing) { isResizing = false; saveData(); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); }
    }
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== triggerBtn) closePanel();
  }

  function renderPanelContent() {
    if (!panel) return;
    panel.innerHTML = `
      <div class="nlm-resize-handle-tr" title="拖动右上角调整大小">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="0" x2="12" y2="10" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
          <line x1="6" y1="0" x2="12" y2="6" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
          <line x1="10" y1="0" x2="12" y2="2" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
        </svg>
      </div>
      <div class="nlm-prompt-header">
        <h3>${NLM.i18n.get('questionHistoryPanelTitle')}</h3>
        <button class="nlm-history-clear-btn" title="${NLM.i18n.get('cartClearAll')}">🗑️</button>
      </div>
      <div class="nlm-prompt-list">
        ${historyData.length === 0 ? `<div class="nlm-prompt-empty">${NLM.i18n.get('questionHistoryEmpty')}</div>` : ''}
        ${historyData.map((item, i) => `
          <div class="nlm-prompt-item nlm-history-item" data-index="${i}">
            <div class="nlm-prompt-item-main">
              <div class="nlm-prompt-item-preview">${escapeHtml(item.text)}</div>
              <div class="nlm-history-item-time">${new Date(item.timestamp).toLocaleTimeString()}</div>
            </div>
            <button class="nlm-prompt-delete" title="${NLM.i18n.get('btnDelete')}">×</button>
          </div>
        `).join('')}
      </div>
    `;

    panel.querySelectorAll('.nlm-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('nlm-prompt-delete')) return;
        const idx = parseInt(item.dataset.index);
        const data = historyData[idx];
        if (data) {
          const input = NLM.DOM.findChatInput();
          if (input) { NLM.DOM.setInputText(input, data.text); input.focus(); closePanel(); }
        }
      });
    });

    panel.querySelectorAll('.nlm-prompt-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.closest('.nlm-history-item').dataset.index);
        historyData.splice(idx, 1);
        await saveData();
        renderPanelContent();
      });
    });

    panel.querySelector('.nlm-history-clear-btn')?.addEventListener('click', async () => {
      if (confirm(NLM.i18n.get('cartClearAll') + '?')) {
        historyData = []; await saveData(); renderPanelContent();
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
  }

  async function init() {
    if (isInitialized) return;
    await loadData();
    createTriggerButton();
    setupCapture();
    posTimer = requestAnimationFrame(updateBtnPosition);
    isInitialized = true;
    console.log(LOG, '已启动 (v1.3.1.1)');
  }

  function destroy() {
    closePanel();
    if (triggerBtn) triggerBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    triggerBtn = null;
    isInitialized = false;
  }

  return { init, destroy, closePanel };
})();
