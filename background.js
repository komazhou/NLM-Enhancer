/**
 * NLM Enhancer Background Script - 终极调试模式 (v1.7.10)
 */

// 终极上帝模式：移除 CSP 并强制注入跨域头
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2],
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Referer", operation: "set", value: "https://notebooklm.google.com/" },
          { header: "Origin", operation: "set", value: "https://notebooklm.google.com" }
        ],
        responseHeaders: [
          { header: "Access-Control-Allow-Origin", operation: "set", value: "https://notebooklm.google.com" },
          { header: "Access-Control-Allow-Credentials", operation: "set", value: "true" },
          { header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, OPTIONS, HEAD" },
          { header: "Access-Control-Allow-Headers", operation: "set", value: "*" }
        ]
      },
      condition: {
        // 覆盖所有可能的媒体域名，不论谁发起
        requestDomains: ["usercontent.goog", "googleusercontent.com", "googlevideo.com", "google.com"],
        resourceTypes: ["xmlhttprequest", "media", "other"]
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "Content-Security-Policy", operation: "remove" },
          { header: "X-Content-Security-Policy", operation: "remove" },
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" }
        ]
      },
      condition: {
        // 彻底移除 NotebookLM 网页自身的 CSP 限制，防止其阻断 connect-src
        urlFilter: "||notebooklm.google.com/*",
        resourceTypes: ["main_frame", "sub_frame"]
      }
    }
  ]
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ nlmPendingUpdate: currentVersion });
  }
});
