/**
 * NLM Enhancer 发送行为自定义模块
 * 允许将发送快捷键从 Enter 改为 Ctrl+Enter
 * Enter 键将变为换行，防止误触发送
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.SendBehavior = (() => {
  const LOG = '[NLM Enhancer SendBehavior]';
  let isEnabled = false;
  let isListenersActive = false;
  let observer = null;
  const attachedElements = new WeakSet();
  const cleanupFns = [];

  /**
   * 在 contenteditable 中插入换行
   */
  function insertNewlineInContentEditable(target) {
    const success = document.execCommand('insertLineBreak', false);
    if (success) {
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // 兜底方案：模拟 Shift+Enter
    const event = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      shiftKey: true, bubbles: true, cancelable: true,
    });
    target.dispatchEvent(event);
  }

  /**
   * 在 textarea 中插入换行
   */
  function insertNewlineInTextarea(textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + '\n' + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + 1;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * 键盘事件处理器
   */
  function handleKeyDown(event) {
    if (!isEnabled) return;
    if (event.isComposing) return; // 忽略 IME 输入法组合
    if (event.key !== 'Enter') return;

    const target = event.target;
    const isContentEditable = target.isContentEditable || target.getAttribute('contenteditable') === 'true';
    const isTextarea = target.tagName === 'TEXTAREA';
    if (!isContentEditable && !isTextarea) return;

    // Ctrl+Enter 或 Cmd+Enter：发送消息
    if (event.ctrlKey || event.metaKey) {
      const sendBtn = NLM.DOM.findSendButton();
      if (sendBtn) {
        event.preventDefault();
        event.stopPropagation();
        sendBtn.click();
      }
      return;
    }

    // Shift+Enter：保持默认行为（通常为换行）
    if (event.shiftKey) return;

    // 普通 Enter：插入换行而非发送
    event.preventDefault();
    event.stopPropagation();

    if (isContentEditable) {
      insertNewlineInContentEditable(target);
    } else if (isTextarea) {
      insertNewlineInTextarea(target);
    }
  }

  function attachToInput(element) {
    if (attachedElements.has(element)) return;
    element.addEventListener('keydown', handleKeyDown, { capture: true });
    attachedElements.add(element);
    cleanupFns.push(() => {
      element.removeEventListener('keydown', handleKeyDown, { capture: true });
      attachedElements.delete(element);
    });
  }

  function attachToAllInputs() {
    const editables = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
    editables.forEach(attachToInput);
  }

  function activateListeners() {
    if (isListenersActive) return;
    isListenersActive = true;

    attachToAllInputs();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.isContentEditable || node.getAttribute('role') === 'textbox' || node.tagName === 'TEXTAREA') {
            attachToInput(node);
          }
          const editables = node.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
          editables.forEach(attachToInput);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function deactivateListeners() {
    if (!isListenersActive) return;
    isListenersActive = false;
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
    if (observer) { observer.disconnect(); observer = null; }
  }

  // === 公开 API ===
  async function init() {
    isEnabled = await NLM.Storage.get('ctrlEnterSend');
    if (isEnabled) activateListeners();

    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.ctrlEnterSend) {
        isEnabled = changes.ctrlEnterSend.newValue === true;
        if (isEnabled) activateListeners();
        else deactivateListeners();
        console.log(LOG, isEnabled ? '已启用 Ctrl+Enter 发送' : '已恢复 Enter 发送');
      }
    });

    console.log(LOG, '已初始化', isEnabled ? '(Ctrl+Enter 模式)' : '(默认模式)');
  }

  function destroy() {
    isEnabled = false;
    deactivateListeners();
  }

  return { init, destroy };
})();
