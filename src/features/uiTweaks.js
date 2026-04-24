/**
 * NotebookLM++ 界面自定义模块
 * 调整聊天区宽度和字体大小
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.UITweaks = (() => {
  const LOG = '[NLM++ UITweaks]';
  const STYLE_ID = 'nlm-ui-tweaks-style';
  const DEFAULT_WIDTH = 70;
  const DEFAULT_FONT = 100;

  let isEnabled = false;
  let currentWidth = DEFAULT_WIDTH;
  let currentFont = DEFAULT_FONT;
  let sidePanelObserver = null;

  function applyStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    const screenWidth = screen.availWidth || screen.width || 1920;
    const widthValue = `${Math.round((currentWidth / 100) * screenWidth)}px`;
    const fontSize = `${currentFont}%`;

    style.textContent = `
      /* === NotebookLM++ 界面自定义 === */

      /* 解除外层容器宽度限制 */
      main,
      [role="main"],
      .chat-container,
      .conversation-container,
      .chat-history {
        max-width: none !important;
      }

      /* 消息气泡宽度控制 */
      .chat-message,
      .message-container,
      .conversation-turn,
      [data-message-id],
      .user-query-container,
      .model-response-container,
      .response-container {
        max-width: ${widthValue} !important;
        width: min(100%, ${widthValue}) !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 输入区域跟随宽度 */
      .input-area-container,
      .chat-input-container {
        max-width: ${widthValue} !important;
        width: min(100%, ${widthValue}) !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 字体大小 */
      .chat-message,
      .message-container,
      [data-message-id],
      .response-container,
      .model-response {
        font-size: ${fontSize} !important;
      }
    `;
  }

  /**
   * 渲染侧边栏（引用来源面板）中的公式
   */
  function renderSidePanelMath() {
    // 查找侧边栏容器（NotebookLM 的来源面板通常在 aside 或含有 specific class 的 div 中）
    const sidePanel = document.querySelector('aside, [role="complementary"], .source-panel, .drawer-content');
    if (!sidePanel || !window.renderMathInElement) return;

    // 检查是否已经渲染过，避免重复渲染导致的性能问题
    const needsRender = sidePanel.innerText.includes('$') || sidePanel.innerText.includes('\\[');
    if (!needsRender) return;

    window.renderMathInElement(sidePanel, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\\\[", right: "\\\\]", display: true},
        {left: "\\\\(", right: "\\\\)", display: false}
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
      throwOnError: false
    });
    console.log(LOG, '侧边栏公式渲染完成');
  }

  /**
   * 启动侧边栏监控
   */
  function startSidePanelMonitor() {
    if (sidePanelObserver) return;

    let debounceTimer;
    sidePanelObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderSidePanelMath, 1000); // 侧边栏内容加载较慢，延迟渲染
    });

    sidePanelObserver.observe(document.body, { childList: true, subtree: true });
  }

  function removeStyles() {
    document.getElementById(STYLE_ID)?.remove();
  }

  // === 公开 API ===
  async function init() {
    isEnabled = await NLM.Storage.get('uiTweaksEnabled');
    currentWidth = await NLM.Storage.get('chatWidthPercent') || DEFAULT_WIDTH;
    currentFont = await NLM.Storage.get('fontSizePercent') || DEFAULT_FONT;

    if (isEnabled) applyStyles();
    
    // 始终开启侧边栏公式渲染监控，无论宽度调整是否开启
    startSidePanelMonitor();
    setTimeout(renderSidePanelMath, 2000); // 初始渲染

    NLM.Storage.onChange((changes, area) => {
      if (area !== 'sync') return;

      if (changes.uiTweaksEnabled) {
        isEnabled = changes.uiTweaksEnabled.newValue === true;
        if (isEnabled) applyStyles();
        else removeStyles();
      }

      if (changes.chatWidthPercent) {
        currentWidth = changes.chatWidthPercent.newValue || DEFAULT_WIDTH;
        if (isEnabled) applyStyles();
      }

      if (changes.fontSizePercent) {
        currentFont = changes.fontSizePercent.newValue || DEFAULT_FONT;
        if (isEnabled) applyStyles();
      }
    });

    console.log(LOG, '已初始化', isEnabled ? `(宽${currentWidth}%, 字${currentFont}%)` : '(未启用)');
  }

  function destroy() {
    removeStyles();
    if (sidePanelObserver) {
      sidePanelObserver.disconnect();
      sidePanelObserver = null;
    }
  }

  return { init, destroy };
})();
