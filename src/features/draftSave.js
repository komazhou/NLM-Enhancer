/**
 * NotebookLM++ 输入草稿自动保存模块
 * 自动保存输入框内容，页面刷新或意外关闭后自动恢复
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.DraftSave = (() => {
  const LOG = '[NLM++ DraftSave]';
  const DRAFT_PREFIX = 'nlmDraft_';
  const MAX_DRAFTS = 5;
  const SAVE_DEBOUNCE_MS = 1000;
  const RESTORE_DELAY_MS = 500;

  let isEnabled = false;
  let saveTimer = null;
  let sendCheckTimer = null;
  let urlCheckTimer = null;
  let observer = null;
  let inputListener = null;
  let attachedInput = null;
  let currentPath = '';
  let lastSavedContent = '';
  let hasRestoredForCurrentPath = false;

  function getPath() {
    return window.location.pathname + window.location.search;
  }

  function getDraftKey(path) {
    return `${DRAFT_PREFIX}${path}`;
  }

  function findInput() {
    return NLM.DOM.findChatInput();
  }

  function isInputEmpty(input) {
    const text = NLM.DOM.getInputText(input).trim();
    if (text.length === 0) return true;

    // 检查是否只是占位符文字
    const placeholder = input.getAttribute('placeholder') ||
                         input.getAttribute('aria-placeholder') || '';
    return placeholder.trim() === text;
  }

  // --- 存储操作 ---

  function saveDraft(path, content) {
    const trimmed = content.trim();
    if (!trimmed) {
      removeDraft(path);
      return;
    }

    const key = getDraftKey(path);
    NLM.Storage.setLocal(key, {
      content: trimmed,
      timestamp: Date.now(),
      path,
    });
    lastSavedContent = trimmed;
  }

  function removeDraft(path) {
    NLM.Storage.removeLocal(getDraftKey(path));
    lastSavedContent = '';
  }

  async function loadDraft(path) {
    const data = await NLM.Storage.getLocal(getDraftKey(path));
    return data?.content ?? null;
  }

  async function pruneOldDrafts() {
    // 使用 chrome.storage.local 直接获取所有键
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(null, (items) => {
          const drafts = [];
          for (const [key, value] of Object.entries(items)) {
            if (key.startsWith(DRAFT_PREFIX) && value?.timestamp) {
              drafts.push({ key, timestamp: value.timestamp });
            }
          }
          if (drafts.length <= MAX_DRAFTS) { resolve(); return; }
          drafts.sort((a, b) => a.timestamp - b.timestamp);
          const toRemove = drafts.slice(0, drafts.length - MAX_DRAFTS).map((d) => d.key);
          chrome.storage.local.remove(toRemove, resolve);
        });
      } catch { resolve(); }
    });
  }

  // --- 输入监听 ---

  function handleInputChange() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const input = findInput();
      if (!input) return;
      const content = NLM.DOM.getInputText(input).trim();
      if (content === lastSavedContent) return;
      saveDraft(getPath(), content);
    }, SAVE_DEBOUNCE_MS);
  }

  function attachInputListener(input) {
    if (attachedInput === input) return;
    detachInputListener();

    inputListener = () => handleInputChange();
    input.addEventListener('input', inputListener, { capture: true });
    attachedInput = input;
  }

  function detachInputListener() {
    if (attachedInput && inputListener) {
      attachedInput.removeEventListener('input', inputListener, { capture: true });
    }
    attachedInput = null;
    inputListener = null;
  }

  // --- 发送检测 ---

  function startSendDetection() {
    if (sendCheckTimer) return;
    let wasNonEmpty = false;

    sendCheckTimer = setInterval(() => {
      const input = findInput();
      if (!input) return;
      const empty = isInputEmpty(input);

      if (wasNonEmpty && empty) {
        removeDraft(getPath());
        wasNonEmpty = false;
      } else if (!empty) {
        wasNonEmpty = true;
      }
    }, 1000);
  }

  function stopSendDetection() {
    if (sendCheckTimer) clearInterval(sendCheckTimer);
    sendCheckTimer = null;
  }

  // --- 草稿恢复 ---

  async function restoreDraft() {
    const path = getPath();
    if (hasRestoredForCurrentPath && path === currentPath) return;

    const content = await loadDraft(path);
    if (!content) { hasRestoredForCurrentPath = true; return; }

    const tryRestore = (attempts) => {
      const input = findInput();
      if (input && isInputEmpty(input)) {
        NLM.DOM.setInputText(input, content);
        lastSavedContent = content;
        hasRestoredForCurrentPath = true;
        console.log(LOG, '草稿已恢复');
        return;
      }
      if (input && !isInputEmpty(input)) {
        hasRestoredForCurrentPath = true;
        return;
      }
      if (attempts > 0) {
        setTimeout(() => tryRestore(attempts - 1), RESTORE_DELAY_MS);
      }
    };

    tryRestore(5);
  }

  // --- URL 监测 ---

  function startUrlWatcher() {
    if (urlCheckTimer) return;
    currentPath = getPath();

    urlCheckTimer = setInterval(() => {
      const newPath = getPath();
      if (newPath !== currentPath) {
        // 保存当前草稿
        const input = findInput();
        if (input) {
          const content = NLM.DOM.getInputText(input).trim();
          if (content && content !== lastSavedContent) {
            saveDraft(currentPath, content);
          }
        }

        currentPath = newPath;
        lastSavedContent = '';
        hasRestoredForCurrentPath = false;
        setTimeout(() => restoreDraft(), RESTORE_DELAY_MS);
      }
    }, 500);
  }

  function stopUrlWatcher() {
    if (urlCheckTimer) clearInterval(urlCheckTimer);
    urlCheckTimer = null;
  }

  // --- 启用/禁用 ---

  function enableFeature() {
    if (isEnabled) return;
    isEnabled = true;
    currentPath = getPath();
    lastSavedContent = '';
    hasRestoredForCurrentPath = false;

    const input = findInput();
    if (input) attachInputListener(input);

    observer = NLM.DOM.createDebouncedObserver(() => {
      const input = findInput();
      if (input) attachInputListener(input);
    }, 500);
    observer.observe(document.body, { childList: true, subtree: true });

    startSendDetection();
    startUrlWatcher();
    restoreDraft();
    console.log(LOG, '已启用');
  }

  function disableFeature() {
    if (!isEnabled) return;
    isEnabled = false;

    if (saveTimer) clearTimeout(saveTimer);
    detachInputListener();
    if (observer) observer.disconnect();
    observer = null;
    stopSendDetection();
    stopUrlWatcher();
    console.log(LOG, '已禁用');
  }

  // === 公开 API ===
  async function init() {
    const enabled = await NLM.Storage.get('draftSaveEnabled');
    if (enabled) enableFeature();

    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.draftSaveEnabled) {
        if (changes.draftSaveEnabled.newValue) enableFeature();
        else disableFeature();
      }
    });
  }

  function destroy() {
    disableFeature();
  }

  return { init, destroy };
})();
