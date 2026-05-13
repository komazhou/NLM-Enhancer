/**
 * NLM Enhancer Background Script
 */
const extensionId = chrome.runtime.id;

// 上帝模式：动态篡改请求与响应头，彻底击穿 CORS
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
      ],
      responseHeaders: [
        { header: "Access-Control-Allow-Origin", operation: "set", value: "*" }
      ]
    },
    condition: {
      requestDomains: ["usercontent.goog", "googleusercontent.com", "googlevideo.com"],
      resourceTypes: ["xmlhttprequest", "media"]
    }
  }]
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ nlmPendingUpdate: currentVersion });
  }
});
