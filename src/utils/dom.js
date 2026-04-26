/**
 * NLM Enhancer DOM 工具模块
 * 提供 MutationObserver、元素查找等通用 DOM 操作辅助
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.DOM = (() => {
  /**
   * 查找 NotebookLM 的聊天输入框
   * 适配多种可能的 DOM 结构
   * @returns {HTMLElement|null}
   */
  function findChatInput() {
    // === 策略1：通过 placeholder 精确匹配聊天输入框 ===
    // NotebookLM 的聊天输入框含 "开始输入" 或 "Start typing" 等占位符
    const placeholderSelectors = [
      'textarea[placeholder*="开始输入"]',
      'textarea[placeholder*="Start typing"]',
      'textarea[placeholder*="输入"]',
      'textarea[placeholder*="type"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="ask"]',
      'div[contenteditable="true"][data-placeholder*="输入"]',
      'div[contenteditable="true"][data-placeholder*="type"]',
      'div[contenteditable="true"][aria-placeholder*="输入"]',
    ];

    for (const selector of placeholderSelectors) {
      try {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          if (typeof el.getBoundingClientRect === 'function' && el.getBoundingClientRect().height > 0 && el.offsetParent !== null) {
            return el;
          }
        }
      } catch { /* 选择器无效时跳过 */ }
    }

    // === 策略2：在右侧主内容区查找输入框，排除左侧面板 ===
    const allInputs = document.querySelectorAll(
      'textarea, div[contenteditable="true"][role="textbox"], div[contenteditable="true"]'
    );

    for (const el of allInputs) {
      // 排除左侧面板（来源搜索框等）
      if (el.closest('aside') || el.closest('[role="complementary"]') ||
          el.closest('nav') || el.closest('[role="navigation"]')) {
        continue;
      }

      // 排除搜索类输入框（含"搜索"、"search"、"source"关键词）
      const placeholder = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
      if (placeholder.includes('搜索') || placeholder.includes('search') ||
          placeholder.includes('source') || placeholder.includes('来源') ||
          placeholder.includes('url') || placeholder.includes('网络')) {
        continue;
      }

      // 确保可见
      if (typeof el.getBoundingClientRect === 'function' && el.getBoundingClientRect().height > 0 && el.offsetParent !== null) {
        return el;
      }
    }

    // === 策略3：通过位置启发式——取页面底部的可见输入框 ===
    let bestCandidate = null;
    let bestBottom = 0;
    for (const el of allInputs) {
      if (typeof el.getBoundingClientRect !== 'function') continue;
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && el.offsetParent !== null && rect.bottom > bestBottom) {
        bestBottom = rect.bottom;
        bestCandidate = el;
      }
    }
    return bestCandidate;
  }

  /**
   * 查找输入框的容器（视觉外框）
   * @returns {HTMLElement|null}
   */
  function findChatInputContainer() {
    const input = findChatInput();
    if (!input) return null;

    // 向上寻找包含类名 query-box 的容器
    const container = input.closest('.query-box') || 
                      input.closest('.query-box-container') ||
                      input.closest('.input-group') ||
                      input.parentElement;
    
    return container;
  }

  /**
   * 获取输入框的文本内容
   * @param {HTMLElement} input
   * @returns {string}
   */
  function getInputText(input) {
    if (input instanceof HTMLTextAreaElement) {
      return input.value;
    }
    return input.innerText ?? input.textContent ?? '';
  }

  /**
   * 设置输入框的文本内容
   * @param {HTMLElement} input
   * @param {string} text
   */
  function setInputText(input, text) {
    if (input instanceof HTMLTextAreaElement) {
      // 使用原生 setter 以触发 React 的事件系统
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * 在输入框末尾追加文本
   * @param {HTMLElement} input
   * @param {string} text
   */
  function appendToInput(input, text) {
    if (input instanceof HTMLTextAreaElement) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      const current = input.value;
      const prefix = current.trim().length > 0 ? '\n\n' : '';
      nativeInputValueSetter.call(input, current + prefix + text);
      input.selectionStart = input.selectionEnd = input.value.length;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable
      input.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      const current = (input.innerText ?? '').trim();
      const prefix = current.length > 0 ? '\n\n' : '';
      try {
        document.execCommand('insertText', false, prefix + text);
      } catch {
        input.appendChild(document.createTextNode(prefix + text));
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * 查找发送按钮
   * @returns {HTMLElement|null}
   */
  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="发送"]',
      'button[data-tooltip*="Send"]',
      'button[data-tooltip*="send"]',
      'button[mattooltip*="Send"]',
      '[data-send-button]',
      '.send-button',
    ];

    for (const selector of selectors) {
      try {
        const btn = document.querySelector(selector);
        if (btn && btn.offsetParent !== null) return btn;
      } catch { /* 选择器无效时跳过 */ }
    }

    // 兜底：查找含 send 图标的按钮
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const icon = btn.querySelector('mat-icon, .material-icons, .material-symbols-outlined');
      if (icon && icon.textContent?.trim().toLowerCase() === 'send' && btn.offsetParent !== null) {
        return btn;
      }
    }
    return null;
  }

  /**
   * 等待元素出现
   * @param {string} selector
   * @param {number} timeout - 超时时间(ms)
   * @returns {Promise<HTMLElement>}
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`[NLM Enhancer] 等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  /**
   * 查找所有对话消息节点
   * @returns {Array<{type: 'user'|'model', element: HTMLElement, text: string}>}
   */
  function findAllMessages() {
    const messages = [];

    // NotebookLM 的消息容器选择器
    const containerSelectors = [
      '.individual-message',
      '.chat-message-pair',
      'mat-mdc-card.from-user-message-card-content',
      'mat-mdc-card.to-user-message-card-content'
    ];

    let messageEls = [];
    // 限定在中部的主要聊天区域查找，排除侧边栏
    const chatArea = document.querySelector('.chat-panel-content') ||
                     document.querySelector('.chat-panel') ||
                     document.querySelector('main');

    if (chatArea) {
      for (const sel of containerSelectors) {
        const els = chatArea.querySelectorAll(sel);
        if (els.length > 0) {
          messageEls = Array.from(els);
          break;
        }
      }
    }

    messageEls.forEach((child) => {
      if (child.style.display === 'none' || child.classList.contains('nlm-hidden-msg')) return;
      // 避免重复包含（比如 .chat-message-pair 包含 individual-message）
      if (child.classList.contains('chat-message-pair')) {
        const subMsgs = child.querySelectorAll('.individual-message, .from-user-message-card-content, .to-user-message-card-content');
        if (subMsgs.length > 0) return; // 让它通过子元素被收集
      }

      // 尝试查找实际的正文容器，以排除操作按钮、建议等
      const contentEl = child.querySelector('.message-text-content, .message-content, .mat-mdc-card-content') || child;
      
      // 在提取文本前，先克隆一份并清理掉干扰元素
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll('.mat-mdc-card-actions, .suggestions-container, button, mat-icon, .citation-marker').forEach(el => el.remove());
      
      const text = clone.innerText?.trim() || clone.textContent?.trim() || '';
      if (text.length === 0) return;

      const isUser = child.classList.contains('from-user-message-card-content') ||
                     child.querySelector('.from-user-message-card-content, .from-user-container') !== null ||
                     child.classList.contains('user');

      messages.push({
        type: isUser ? 'user' : 'model',
        element: child,
        text: text
      });
    });

    return messages;
  }

  /**
   * 创建一个带防抖的 MutationObserver
   * @param {Function} callback
   * @param {number} debounceMs
   * @returns {MutationObserver}
   */
  function createDebouncedObserver(callback, debounceMs = 300) {
    let timer = null;
    return new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(callback, debounceMs);
    });
  }

  /**
   * 显示临时 Toast 提示
   * @param {string} message
   * @param {number} x - 水平位置
   * @param {number} y - 垂直位置
   * @param {boolean} success
   * @param {number} duration - 显示时长(ms)
   */
  function showToast(message, x, y, success = true, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'nlm-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y - 40}px;
      z-index: 999999;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      ${success
        ? 'background: rgba(52, 168, 83, 0.9); color: #fff; box-shadow: 0 4px 12px rgba(52,168,83,0.3);'
        : 'background: rgba(234, 67, 53, 0.9); color: #fff; box-shadow: 0 4px 12px rgba(234,67,53,0.3);'
      }
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    findChatInput,
    getInputText,
    setInputText,
    appendToInput,
    findSendButton,
    waitForElement,
    findAllMessages,
    createDebouncedObserver,
    showToast,
    findChatInputContainer,
  };
})();
