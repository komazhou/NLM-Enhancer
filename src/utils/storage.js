/**
 * NLM Enhancer 存储工具模块
 * 封装 chrome.storage API，提供统一的设置读写接口
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.Storage = (() => {
  // 默认设置值
  const DEFAULTS = {
    // 功能开关
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

    // 公式复制格式: 'latex' | 'mathml' | 'no-dollar' | 'notion'
    formulaCopyFormat: 'latex',

    // 界面自定义
    chatWidthPercent: 70,
    fontSizePercent: 100,

    // 提示词库数据（JSON 字符串数组）
    promptVaultData: '[]',
  };

  /**
   * 获取所有设置
   * @returns {Promise<Object>}
   */
  async function getAll() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (result) => {
          resolve(result);
        });
      } catch (e) {
        console.warn('[NLM Enhancer] Storage getAll failed:', e);
        resolve({ ...DEFAULTS });
      }
    });
  }

  /**
   * 获取单个设置
   * @param {string} key
   * @returns {Promise<any>}
   */
  async function get(key) {
    return new Promise((resolve) => {
      try {
        const defaultVal = DEFAULTS[key] !== undefined ? { [key]: DEFAULTS[key] } : {};
        chrome.storage.sync.get(defaultVal, (result) => {
          resolve(result[key]);
        });
      } catch (e) {
        console.warn('[NLM Enhancer] Storage get failed:', e);
        resolve(DEFAULTS[key]);
      }
    });
  }

  /**
   * 设置值
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  async function set(key, value) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 监听设置变化
   * @param {Function} callback - (changes, areaName) => void
   */
  function onChange(callback) {
    chrome.storage.onChanged.addListener(callback);
  }

  /**
   * 获取本地存储（用于草稿等大数据）
   */
  async function getLocal(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => {
          resolve(result[key] ?? null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function setLocal(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, resolve);
      } catch (e) {
        resolve();
      }
    });
  }

  async function removeLocal(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(key, resolve);
      } catch (e) {
        resolve();
      }
    });
  }

  return { DEFAULTS, getAll, get, set, onChange, getLocal, setLocal, removeLocal };
})();
