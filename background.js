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
      // 强制改写 Google 的响应头，给浏览器发“通行证”
      responseHeaders: [
        { header: "Access-Control-Allow-Origin", operation: "set", value: `chrome-extension://${extensionId}` },
        { header: "Access-Control-Allow-Credentials", operation: "set", value: "true" }
      ]
    },
    condition: {
      // 拦截该扩展页面发出的所有请求
      initiatorDomains: [extensionId],
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
