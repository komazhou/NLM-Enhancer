/**
 * NLM Enhancer Background Script
 */

chrome.runtime.onInstalled.addListener((details) => {
  // 1. 植入伪装规则：利用 DNR 击穿防盗链
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Referer", operation: "set", value: "https://notebooklm.google.com/" },
          { header: "Origin", operation: "set", value: "https://notebooklm.google.com" }
        ]
      },
      condition: {
        urlFilter: "||usercontent.goog/*",
        resourceTypes: ["xmlhttprequest"]
      }
    }]
  });

  // 2. 仅在插件自动更新时触发通知标记
  if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ nlmPendingUpdate: currentVersion });
  }
});
