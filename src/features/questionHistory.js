/**
 * NLM Enhancer 历史问题记录模块
 * 自动记录每次发送的问题，支持从面板中找回并一键填回输入框
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
  let observer = null;

  // --- 存储管理 ---

  async function loadHistory() {
    try {
      const data = await NLM.Storage.getLocal('nlm_question_history');
      historyData = Array.isArray(data) ? data : [];
    } catch {
      historyData = [];
    }
  }

  async function saveHistory() {
    await NLM.Storage.setLocal('nlm_question_history', historyData);
  }

  /**
   * 记录新问题
   * @param {string} text 
   */
  async function recordQuestion(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    // 去重逻辑：如果已存在，先删除旧的，然后将新的插到最前
    const idx = historyData.findIndex(item => item.text === trimmedText);
    if (idx !== -1) {
      historyData.splice(idx, 1);
    }

    historyData.unshift({
      id: Date.now().toString(),
      text: trimmedText,
      timestamp: Date.now()
    });

    // 上限控制
    if (historyData.length > MAX_HISTORY) {
      historyData = historyData.slice(0, MAX_HISTORY);
    }

    await saveHistory();
    if (panel) renderPanelContent();
  }

  // --- 监听发送动作 ---

  function setupCapture() {
    // 策略1：监听输入框的回车键（捕获阶段，赶在页面处理前）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const input = NLM.DOM.findChatInput();
        if (e.target === input) {
          // 如果是普通回车发送（非 Shift+Enter）或者是 Ctrl+Enter
          const isCtrlSend = e.ctrlKey || e.metaKey;
          // 注意：NotebookLM 默认是 Enter 发送，但插件可能启用了 Ctrl+Enter 发送
          // 我们这里统统记录，只要它触发了发送意图
          const text = NLM.DOM.getInputText(input);
          if (text) recordQuestion(text);
        }
      }
    }, true);

    // 策略2：监听发送按钮的点击
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

  // --- UI 逻辑 ---

  function createTriggerButton() {
    if (triggerBtn) return;

    triggerBtn = document.createElement('button');
    triggerBtn.className = 'nlm-history-trigger';
    triggerBtn.innerHTML = `🕒<span class="nlm-trigger-label">${NLM.i18n.get('questionHistoryTitle')}</span>`;
    triggerBtn.title = NLM.i18n.get('questionHistoryTitle');

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    document.body.appendChild(triggerBtn);
  }

  function updateBtnPosition() {
    if (triggerBtn) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.top > 0) {
          triggerBtn.style.right = 'auto';
          triggerBtn.style.bottom = 'auto';
          // 放在提示词库按钮的右侧。PromptVault 的宽度大概在 90px-110px
          // 我们这里动态计算一下
          const promptBtn = document.querySelector('.nlm-prompt-trigger');
          const offset = promptBtn ? promptBtn.offsetWidth + 8 : 0;
          
          triggerBtn.style.left = `${rect.left + offset}px`;
          triggerBtn.style.top = `${rect.top - triggerBtn.offsetHeight}px`;
          
          if (panel && panel.style.display !== 'none') {
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top - triggerBtn.offsetHeight - 8 - panel.offsetHeight}px`;
          }
        }
      }
    }
    posTimer = requestAnimationFrame(updateBtnPosition);
  }

  function togglePanel() {
    if (panel) closePanel();
    else openPanel();
  }

  function openPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'nlm-prompt-panel nlm-history-panel'; // 复用样式类名
    renderPanelContent();
    document.body.appendChild(panel);
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 100);
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== triggerBtn) {
      closePanel();
    }
  }

  function renderPanelContent() {
    if (!panel) return;

    panel.innerHTML = `
      <div class="nlm-prompt-header">
        <h3>${NLM.i18n.get('questionHistoryPanelTitle')}</h3>
        <button class="nlm-history-clear-btn" title="${NLM.i18n.get('cartClearAll')}">🗑️</button>
      </div>
      <div class="nlm-prompt-list">
        ${historyData.length === 0 ? `<div class="nlm-prompt-empty">${NLM.i18n.get('questionHistoryEmpty')}</div>` : ''}
        ${historyData.map((item, i) => `
          <div class="nlm-prompt-item nlm-history-item" data-index="${i}">
            <div class="nlm-prompt-item-preview">${escapeHtml(item.text)}</div>
            <div class="nlm-history-item-time">${new Date(item.timestamp).toLocaleTimeString()}</div>
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
          if (input) {
            NLM.DOM.setInputText(input, data.text);
            input.focus();
            closePanel();
          }
        }
      });
    });

    panel.querySelectorAll('.nlm-prompt-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.nlm-history-item');
        const idx = parseInt(item.dataset.index);
        historyData.splice(idx, 1);
        await saveHistory();
        renderPanelContent();
      });
    });

    panel.querySelector('.nlm-history-clear-btn')?.addEventListener('click', async () => {
      if (confirm(NLM.i18n.get('cartClearAll') + '?')) {
        historyData = [];
        await saveHistory();
        renderPanelContent();
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === 公开 API ===
  async function init() {
    if (isInitialized) return;
    await loadHistory();
    createTriggerButton();
    setupCapture();
    posTimer = requestAnimationFrame(updateBtnPosition);
    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    closePanel();
    if (triggerBtn) triggerBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    triggerBtn = null;
    isInitialized = false;
  }

  return { init, destroy };
})();
