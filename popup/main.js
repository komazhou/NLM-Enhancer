/**
 * NLM Enhancer Popup 设置界面逻辑
 * 管理所有功能的开关、格式选择和滑块配置
 */

document.addEventListener('DOMContentLoaded', async () => {
  // === i18n 本地化系统 ===
  // 加载两个语言包
  const [enMessages, zhMessages] = await Promise.all([
    fetch(chrome.runtime.getURL('_locales/en/messages.json')).then(r => r.json()),
    fetch(chrome.runtime.getURL('_locales/zh_CN/messages.json')).then(r => r.json()),
  ]);

  const LANG_PACKS = { en: enMessages, zh_CN: zhMessages };

  // 获取用户保存的语言偏好，默认跟随浏览器
  const stored = await new Promise(r => chrome.storage.sync.get({ uiLanguage: 'auto' }, r));
  let currentLang = stored.uiLanguage;

  // auto 模式时，根据浏览器语言决定
  function resolveLocale(lang) {
    if (lang !== 'auto') return lang;
    const browserLang = chrome.i18n.getUILanguage();
    return (browserLang.startsWith('zh')) ? 'zh_CN' : 'en';
  }

  // 获取指定 key 的翻译文本
  function getMsg(key, substitutions) {
    const locale = resolveLocale(currentLang);
    const pack = LANG_PACKS[locale] || LANG_PACKS.en;
    const entry = pack[key] || LANG_PACKS.en[key];
    if (!entry) return key;
    let msg = entry.message;
    // 处理 placeholder 替换
    if (substitutions && entry.placeholders) {
      Object.entries(entry.placeholders).forEach(([name, ph]) => {
        const idx = parseInt(ph.content.replace('$', '')) - 1;
        if (substitutions[idx] !== undefined) {
          msg = msg.replace(`$${name.toUpperCase()}$`, substitutions[idx]);
        }
      });
    }
    return msg;
  }

  // 将翻译应用到所有 data-i18n 元素
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const msg = getMsg(key);
      if (msg) el.textContent = msg;
    });
    document.title = getMsg('popupTitle');

    // 更新语言按钮标签
    const label = document.getElementById('langLabel');
    if (label) {
      const resolved = resolveLocale(currentLang);
      label.textContent = resolved === 'zh_CN' ? '中文' : 'EN';
    }
  }

  // 初始化 i18n
  applyI18n();

  // === 语言切换按钮 ===
  const langBtn = document.getElementById('langSwitch');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const resolved = resolveLocale(currentLang);
      // 切换语言
      currentLang = (resolved === 'en') ? 'zh_CN' : 'en';
      chrome.storage.sync.set({ uiLanguage: currentLang });
      applyI18n();
    });
  }


  // 默认设置
  const DEFAULTS = {
    quoteReplyEnabled: true,
    formulaCopyEnabled: true,
    timelineEnabled: true,
    exportEnabled: true,
    promptVaultEnabled: true,
    draftSaveEnabled: true,
    ctrlEnterSend: false,
    uiTweaksEnabled: false,
    preventScrollEnabled: false,
    stashCartEnabled: true,
    questionHistoryEnabled: true,
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
