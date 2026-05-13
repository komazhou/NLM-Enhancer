/**
 * NLM Enhancer Background Script
 */
const extensionId = chrome.runtime.id;

// 上帝模式：为 Content Script 的 fetch 请求注入跨域许可头
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "Access-Control-Allow-Origin", operation: "set", value: "https://notebooklm.google.com" },
        { header: "Access-Control-Allow-Credentials", operation: "set", value: "true" }
      ]
    },
    condition: {
      // 精准拦截：当 NotebookLM 网页尝试 fetch 谷歌媒体节点时
      initiatorDomains: ["notebooklm.google.com"],
      requestDomains: ["usercontent.goog", "googleusercontent.com", "googlevideo.com", "google.com"],
      resourceTypes: ["xmlhttprequest"]
    }
  }]
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ nlmPendingUpdate: currentVersion });
  }
});
