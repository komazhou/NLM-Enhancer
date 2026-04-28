/**
 * NLM Enhancer 自定义 i18n 模块
 * 支持用户手动切换语言（覆盖浏览器默认语言）
 * 通过 chrome.storage.sync 中的 uiLanguage 设置决定当前语言
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.i18n = (() => {
  const LOG = '[NLM i18n]';
  let langPacks = {};
  let currentLocale = 'en';
  let isReady = false;

  /**
   * 初始化：加载语言包并读取用户语言偏好
   */
  async function init() {
    try {
      const [enData, zhData] = await Promise.all([
        fetch(chrome.runtime.getURL('_locales/en/messages.json')).then(r => r.json()),
        fetch(chrome.runtime.getURL('_locales/zh_CN/messages.json')).then(r => r.json()),
      ]);
      langPacks = { en: enData, zh_CN: zhData };

      // 读取用户语言偏好
      const stored = await new Promise(r => chrome.storage.sync.get({ uiLanguage: 'auto' }, r));
      currentLocale = resolveLocale(stored.uiLanguage);
      isReady = true;

      console.log(LOG, '已初始化，当前语言:', currentLocale);
    } catch (e) {
      console.error(LOG, '初始化失败，回退到 chrome.i18n:', e);
    }

    // 监听语言偏好变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.uiLanguage) {
        currentLocale = resolveLocale(changes.uiLanguage.newValue);
        console.log(LOG, '语言已切换:', currentLocale);
      }
    });
  }

  /**
   * 解析 auto 为具体语言代码
   */
  function resolveLocale(lang) {
    if (lang && lang !== 'auto') return lang;
    const browserLang = chrome.i18n.getUILanguage();
    return browserLang.startsWith('zh') ? 'zh_CN' : 'en';
  }

  /**
   * 获取翻译文本
   * @param {string} key - i18n 消息键名
   * @param {string[]} [substitutions] - 占位符替换值
   * @returns {string} 翻译后的文本
   */
  function get(key, substitutions) {
    // 如果模块未就绪，回退到 chrome.i18n
    if (!isReady || !langPacks.en) {
      return chrome.i18n.getMessage(key, substitutions) || key;
    }

    const pack = langPacks[currentLocale] || langPacks.en;
    const entry = pack[key] || langPacks.en[key];
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

  /**
   * 获取当前语言代码
   */
  function getLocale() {
    return currentLocale;
  }

  return { init, get, getLocale };
})();
