/**
 * NLM Enhancer Background Script - 嗅探雷达模式 (v1.7.13)
 */

let latestSniffedVideoUrl = null;

// 嗅探雷达：监听真实的视频分片请求
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // 捕获 Google 的视频播放流链接 (通常包含 videoplayback)
    if (details.url.includes('videoplayback')) {
      latestSniffedVideoUrl = details.url;
      console.log('Background: 嗅探到真实视频流:', latestSniffedVideoUrl);
    }
  },
  { urls: ["https://*.googlevideo.com/*"] }
);

// 终极上帝模式：为拉取请求注入跨域许可
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2],
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" },
          { header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, OPTIONS, HEAD" },
          { header: "Access-Control-Allow-Headers", operation: "set", value: "*" },
          { header: "Access-Control-Expose-Headers", operation: "set", value: "*" }
        ]
      },
      condition: {
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
          { header: "X-Content-Security-Policy", operation: "remove" }
        ]
      },
      condition: {
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

// 处理来自前台的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_SNIFFED_URL') {
    console.log('Background: 正在提供嗅探到的 URL', latestSniffedVideoUrl);
    sendResponse({ url: latestSniffedVideoUrl });
  }
});
