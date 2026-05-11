/**
 * NLM Enhancer Background Script
 */

chrome.runtime.onInstalled.addListener((details) => {
  // 仅在插件自动更新时触发通知标记
  if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ nlmPendingUpdate: currentVersion });
  }
});
