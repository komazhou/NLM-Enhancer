/**
 * NLM Enhancer Popup 设置界面逻辑
 * 管理所有功能的开关、格式选择和滑块配置
 */

document.addEventListener('DOMContentLoaded', async () => {
  // === i18n 本地化系统 ===
  const fetchJson = (lang) => fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`)).then(r => r.json());
  
  const [enMsg, zhMsg, twMsg, jaMsg, esMsg, koMsg] = await Promise.all([
    fetchJson('en'), fetchJson('zh_CN'), fetchJson('zh_TW'), fetchJson('ja'), fetchJson('es'), fetchJson('ko')
  ]);

  const LANG_PACKS = { 
    en: enMsg, zh_CN: zhMsg, zh_TW: twMsg, ja: jaMsg, es: esMsg, ko: koMsg 
  };

  // 获取用户保存的语言偏好
  const stored = await new Promise(r => chrome.storage.sync.get({ uiLanguage: 'auto' }, r));
  let currentLang = stored.uiLanguage;

  // 平台检测 (用于 Ctrl/Cmd 文本替换)
  const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  function resolveLocale(lang) {
    if (lang !== 'auto') return lang;
    const browserLang = chrome.i18n.getUILanguage();
    if (browserLang.includes('TW') || browserLang.includes('HK')) return 'zh_TW';
    if (browserLang.startsWith('zh')) return 'zh_CN';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('es')) return 'es';
    if (browserLang.startsWith('ko')) return 'ko';
    return 'en';
  }

  // === 版本号自动注入 ===
  const currentVersion = chrome.runtime.getManifest().version;
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = 'v' + currentVersion;
  }

  function getMsg(key, substitutions) {
    const locale = resolveLocale(currentLang);
    const pack = LANG_PACKS[locale] || LANG_PACKS.en;
    const entry = pack[key] || LANG_PACKS.en[key];
    if (!entry) return key;
    let msg = entry.message;

    // 平台适配：如果是 Mac，将 Ctrl 替换为 Cmd
    if (isMac && msg.includes('Ctrl')) {
      msg = msg.replace(/Ctrl/g, 'Cmd');
    }

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

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const msg = getMsg(key);
      if (msg) el.textContent = msg;
    });
    document.title = getMsg('popupTitle');

    // 同步下拉框状态
    const select = document.getElementById('langSelect');
    if (select) select.value = currentLang;
  }

  applyI18n();

  // === 语言切换下拉框 ===
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', () => {
      currentLang = langSelect.value;
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

  // === 工具箱：本地去水印入口 ===
  const localRemovalBtn = document.getElementById('btn-openLocalRemoval');
  if (localRemovalBtn) {
    localRemovalBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        // 尝试向当前页面的 Content Script 发送唤起指令
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showWatermarkModal', 
          context: { entry: 'local', mediaType: 'video' } 
        }, () => {
          if (chrome.runtime.lastError) {
            // 兜底路径：如果发送失败（说明当前页没注入插件），则直接打开独立处理页
            console.warn('[NLM] 无法在当前页唤起弹窗，正在打开独立处理页:', chrome.runtime.lastError.message);
            chrome.tabs.create({ url: chrome.runtime.getURL('processing/index.html?mode=local') });
          } else {
            // 主路径：唤起成功，关闭 Popup
            window.close();
          }
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('processing/index.html?mode=local') });
      }
    });
  }
});
