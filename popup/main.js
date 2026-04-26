/**
 * NLM Enhancer Popup 设置界面逻辑
 * 管理所有功能的开关、格式选择和滑块配置
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 默认设置
  const DEFAULTS = {
    quoteReplyEnabled: true,
    formulaCopyEnabled: true,
    timelineEnabled: true,
    exportEnabled: true,
    promptVaultEnabled: true,
    mermaidEnabled: true,
    draftSaveEnabled: true,
    ctrlEnterSend: false,
    uiTweaksEnabled: false,
    preventScrollEnabled: false,
    formulaCopyFormat: 'latex',
    chatWidthPercent: 70,
    fontSizePercent: 100,
  };

  // 加载当前设置
  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });

  // === 初始化 Toggle 开关 ===
  const toggles = document.querySelectorAll('.toggle input[data-key]');
  toggles.forEach((input) => {
    const key = input.dataset.key;
    input.checked = settings[key] === true;

    input.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: input.checked });
    });
  });

  // === 初始化公式格式单选 ===
  const formatRadios = document.querySelectorAll('input[name="formulaFormat"]');
  formatRadios.forEach((radio) => {
    radio.checked = radio.value === settings.formulaCopyFormat;
    radio.addEventListener('change', () => {
      if (radio.checked) {
        chrome.storage.sync.set({ formulaCopyFormat: radio.value });
      }
    });
  });

  // === 初始化滑块 ===
  const widthSlider = document.getElementById('chatWidthSlider');
  const widthValue = document.getElementById('widthValue');
  const fontSlider = document.getElementById('fontSizeSlider');
  const fontValue = document.getElementById('fontValue');

  if (widthSlider) {
    widthSlider.value = settings.chatWidthPercent;
    widthValue.textContent = `${settings.chatWidthPercent}%`;

    widthSlider.addEventListener('input', () => {
      const val = parseInt(widthSlider.value);
      widthValue.textContent = `${val}%`;
      chrome.storage.sync.set({ chatWidthPercent: val });
    });
  }

  if (fontSlider) {
    fontSlider.value = settings.fontSizePercent;
    fontValue.textContent = `${settings.fontSizePercent}%`;

    fontSlider.addEventListener('input', () => {
      const val = parseInt(fontSlider.value);
      fontValue.textContent = `${val}%`;
      chrome.storage.sync.set({ fontSizePercent: val });
    });
  }

  // === 子设置组的联动显示/隐藏 ===
  function updateSubSettingVisibility() {
    // 公式格式组
    const formulaGroup = document.getElementById('formula-format-group');
    const formulaToggle = document.querySelector('[data-key="formulaCopyEnabled"]');
    if (formulaGroup && formulaToggle) {
      formulaGroup.style.display = formulaToggle.checked ? '' : 'none';
    }

    // UI 自定义组
    const uiGroup = document.getElementById('ui-tweaks-group');
    const uiToggle = document.querySelector('[data-key="uiTweaksEnabled"]');
    if (uiGroup && uiToggle) {
      uiGroup.style.display = uiToggle.checked ? '' : 'none';
    }
  }

  // 初始化联动
  updateSubSettingVisibility();

  // 监听 toggle 变化以更新联动
  toggles.forEach((input) => {
    input.addEventListener('change', updateSubSettingVisibility);
  });
});
