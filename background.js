/**
 * NLM Enhancer Background Script - 上帝代理模式 (v1.7.12)
 */

const extensionId = chrome.runtime.id;

// 终极上帝模式：为所有拉取请求注入跨域许可并伪装来源
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
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" },
          { header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, OPTIONS, HEAD" },
          { header: "Access-Control-Allow-Headers", operation: "set", value: "*" },
          { header: "Access-Control-Expose-Headers", operation: "set", value: "*" }
        ]
      },
      condition: {
        // 覆盖谷歌所有媒体分发域名
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

// 代理拉取逻辑：由 Background 执行 fetch，绕过网页 CSP 和 Cookie 限制
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchVideo') {
    console.log('Background: 收到拉取指令', message.url);
    
    fetch(message.url, {
      method: 'GET',
      mode: 'cors'
      // 注意：不携带 credentials，利用 Signed URL 自身的鉴权能力
    })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      console.log('Background: 拉取成功，数据大小:', buffer.byteLength);
      
      // 将 ArrayBuffer 转换为可通过 sendMessage 传输的格式
      // Chrome 扩展支持直接传输 ArrayBuffer
      sendResponse({ success: true, data: buffer });
    })
    .catch((err) => {
      console.error('Background: 拉取失败', err);
      sendResponse({ success: false, error: err.message });
    });
    
    return true; // 保持通道开启
  }
});
