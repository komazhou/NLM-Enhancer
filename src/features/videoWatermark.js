/**
 * NLM Enhancer 视频无水印下载模块
 * 检测 Studio 面板中的视频查看器，注入去水印下载按钮
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.VideoWatermark = (() => {
  const LOG = '[NLM VideoWatermark]';
  const i18n = NLM.i18n;

  // Iframe 安全门
  if (window.self !== window.top) {
    return { init() {}, destroy() {} };
  }

  let isInitialized = false;
  let observer = null;
  let processingWindow = null;

  /**
   * 在 Studio 面板的视频查看器区域注入"无水印下载"按钮
   */
  function injectVideoButton() {
    // 查找视频查看器的 footer 区域
    const artifactFooters = document.querySelectorAll('.artifact-viewer-container .artifact-footer:not([data-has-nlm-video])');
    artifactFooters.forEach(footer => {
      const viewer = footer.closest('.artifact-viewer-container') || footer.closest('artifact-viewer');
      if (!viewer) return;

      // 只在视频类型的查看器中注入
      const videoViewer = viewer.querySelector('video-viewer, .video-viewer');
      const videoEl = viewer.querySelector('video');
      if (!videoViewer && !videoEl) return;

      footer.dataset.hasNlmVideo = 'true';

      const btn = createStudioBtn(i18n.get('videoWmBtnLabel'), () => {
        showWatermarkModal(viewer);
      });
      footer.appendChild(btn);
    });

    // 备选：直接查找包含 <video> 的 artifact 区域
    const videos = document.querySelectorAll('.artifact-viewer-container video, artifact-viewer video');
    videos.forEach(videoEl => {
      const viewer = videoEl.closest('.artifact-viewer-container') || videoEl.closest('artifact-viewer');
      if (!viewer || viewer.dataset.hasNlmVideo) return;

      const footer = viewer.querySelector('.artifact-footer');
      if (footer && !footer.dataset.hasNlmVideo) {
        footer.dataset.hasNlmVideo = 'true';
        const btn = createStudioBtn(i18n.get('videoWmBtnLabel'), () => {
          showWatermarkModal(viewer);
        });
        footer.appendChild(btn);
      }
    });
  }

  /**
   * 创建 Studio 风格按钮（复用 export.js 的 createExportBtn 样式）
   */
  function createStudioBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'mdc-button mat-mdc-button-base button-small mdc-button--outlined mat-mdc-outlined-button mat-unthemed _mat-animation-noopable nlm-studio-export-btn';
    btn.style.marginLeft = '8px';
    btn.innerHTML = `
      <span class="mat-mdc-button-persistent-ripple mdc-button__ripple"></span>
      <mat-icon role="img" class="mat-icon notranslate material-symbols-outlined mat-icon-rtl-mirror google-symbols mat-icon-no-color" data-mat-icon-type="font">video_settings</mat-icon>
      <span class="mdc-button__label" style="margin-left: 4px;">${label}</span>
      <span class="mat-focus-indicator"></span>
      <span class="mat-mdc-button-touch-target"></span>
    `;
    btn.onclick = onClick;
    return btn;
  }

  /**
   * 显示去水印选项弹窗（配置中枢）
   * @param {HTMLElement} viewer 视频容器（网页注入模式下使用）
   * @param {Object} context 上下文参数 { entry: 'web' | 'local', mediaType: 'video' }
   */
  function showWatermarkModal(viewer, context = { entry: 'web', mediaType: 'video' }) {
    const isLocal = context.entry === 'local';
    let videoEl = null;
    let videoTitle = isLocal ? '本地文件' : '';
    let duration = 0;
    let videoWidth = 1920;
    let videoHeight = 1080;
    let videoSrc = null;

    if (!isLocal && viewer) {
      videoEl = viewer.querySelector('video');
      if (!videoEl) {
        NLM.DOM.showToast(i18n.get('videoWmNoVideo'), window.innerWidth / 2, 100, false);
        return;
      }

      // 获取视频信息
      videoSrc = videoEl.src || videoEl.currentSrc;
      duration = videoEl.duration || 0;
      videoWidth = videoEl.videoWidth || 1920;
      videoHeight = videoEl.videoHeight || 1080;

      // 尝试获取视频标题
      const titleInput = viewer.querySelector('input.artifact-title');
      videoTitle = titleInput ? titleInput.value.trim() : '';
      if (!videoTitle) {
        videoTitle = document.title.replace(' - NotebookLM', '') || 'video';
      }
    }

    // 构建弹窗
    const overlay = document.createElement('div');
    overlay.className = 'nlm-modal-overlay nlm-media-config-overlay';

    overlay.innerHTML = `
      <div class="nlm-modal nlm-media-modal" data-entry="${context.entry}" data-type="${context.mediaType}">
        <div class="nlm-modal-header">
          <div class="nlm-modal-title">
            <span style="font-size: 18px;">${context.mediaType === 'video' ? '🎬' : '📄'}</span>
            <span>${i18n.get('wmOptTitle')}</span>
          </div>
          <div class="nlm-modal-close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <div class="nlm-modal-body">
          <div class="nlm-source-info" ${isLocal ? 'style="display: none;"' : ''}>
            <span class="nlm-source-label">${i18n.get('modalSourceLabel')}</span>
            <span class="nlm-source-name">${videoTitle}</span>
          </div>

          <!-- 通用处理选项 -->
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; color: #64748b;">${i18n.get('wmOptTitle')}</div>

          <div class="nlm-media-opt-list">
            <label class="nlm-media-opt-item">
              <div class="nlm-media-opt-info">
                <span class="nlm-media-opt-name">${i18n.get('wmTrimName')}</span>
                <span class="nlm-media-opt-desc">${i18n.get('wmTrimDesc')}</span>
              </div>
              <div class="nlm-media-toggle">
                <input type="checkbox" id="nlmOptTrim" checked>
                <span class="nlm-media-toggle-slider"></span>
              </div>
            </label>

            <label class="nlm-media-opt-item">
              <div class="nlm-media-opt-info">
                <span class="nlm-media-opt-name">${i18n.get('wmDelogoName')}</span>
                <span class="nlm-media-opt-desc">${i18n.get('wmDelogoDesc')}</span>
              </div>
              <div class="nlm-media-toggle">
                <input type="checkbox" id="nlmOptDelogo" checked>
                <span class="nlm-media-toggle-slider"></span>
              </div>
            </label>
          </div>

          <!-- 处理模式 -->
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 10px; color: #64748b;">${i18n.get('wmModeTitle')}</div>
          <select class="nlm-media-mode-select" id="nlmFpsSelect">
            <option value="15">${i18n.get('videoWmModeFast')}</option>
            <option value="30" selected>${i18n.get('wmModeStandard')}</option>
          </select>

          <div class="nlm-modal-actions">
            <!-- 仅在网页注入模式下显示主下载按钮 -->
            ${!isLocal ? `
              <button class="nlm-btn-primary" id="nlmStartProcess">
                ${i18n.get('videoWmStartBtn')}
              </button>
            ` : ''}
            
            <!-- 选择本地文件按钮：在 Local 模式下作为 Primary，在 Web 模式下作为 Secondary -->
            <button class="${isLocal ? 'nlm-btn-primary' : 'nlm-btn-secondary'}" id="nlmPickFile">
              📁 ${i18n.get('wmPickBtnText')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 事件绑定
    const closeBtn = overlay.querySelector('.nlm-modal-close');
    closeBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    /**
     * 收集弹窗选项
     */
    function getModalOptions() {
      const trimEnd = overlay.querySelector('#nlmOptTrim').checked;
      const removeFirstFrameWm = overlay.querySelector('#nlmOptDelogo').checked;
      const fps = parseInt(overlay.querySelector('#nlmFpsSelect').value);
      if (!trimEnd && !removeFirstFrameWm) {
        NLM.DOM.showToast(i18n.get('videoWmNoOption'), window.innerWidth / 2, 100, false);
        return null;
      }
      return { trimEnd, removeFirstFrameWm, fps };
    }

    /**
     * 获取到视频数据/链接后的统一处理入口
     */
    function processWithData(videoData, videoUrl, opts) {
      openProcessingPage(videoData, videoUrl, {
        ...opts,
        fileName: videoTitle,
        duration, videoWidth, videoHeight
      });
      overlay.remove();
      NLM.DOM.showToast(i18n.get('videoWmProcessingStarted'), window.innerWidth / 2, 100, true);
    }

    // ===「开始下载」按钮（仅 Web 模式） ===
    const startBtn = overlay.querySelector('#nlmStartProcess');
    if (startBtn) {
      startBtn.onclick = async () => {
        const opts = getModalOptions();
        if (!opts) return;

        if (!videoSrc) {
          NLM.DOM.showToast(i18n.get('videoWmNoVideo'), window.innerWidth / 2, 100, false);
          return;
        }
        
        startBtn.disabled = true;
        const originalText = startBtn.textContent;
        startBtn.textContent = i18n.get('videoWmFetching') || 'Fetching...';

        try {
          console.log(LOG, '🚀 [调试开始] 尝试拉取视频...', { videoSrc, context: window.location.href });
          
          // 在 Content Script 中 fetch，利用当前会话的 Cookie
          const response = await fetch(videoSrc, {
            method: 'GET',
            credentials: 'include',
            mode: 'cors',
            cache: 'force-cache' // 优先命中浏览器已有的媒体缓存
          });

          console.log(LOG, '📡 [响应状态]', { ok: response.ok, status: response.status, type: response.type });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const videoBlob = await response.blob();
          const videoBuffer = await videoBlob.arrayBuffer();
          
          console.log(LOG, '✅ [获取成功] 字节数:', videoBuffer.byteLength);
          
          // 恢复按钮状态
          startBtn.disabled = false;
          startBtn.textContent = originalText;
          
          // 传输数据
          processWithData(videoBuffer, null, opts);
          
        } catch (err) {
          console.error(LOG, '❌ [下载异常详情]', err);
          
          // 恢复按钮状态
          startBtn.disabled = false;
          startBtn.textContent = originalText;
          
          const isNetworkError = err.message.includes('Failed to fetch');
          let errorMsg = '视频拉取失败。Google 的安全策略可能已升级，阻断了插件的直接获取请求。';
          
          if (isNetworkError) {
             errorMsg += '\n\n【自动降级方案】：点击“确定”后，插件将尝试唤起浏览器原生下载窗口。下载完成后，请点击下方的“📁 选择本地视频文件”按钮并上传刚才下载的文件，即可完成去水印。';
             if (confirm(errorMsg)) {
                chrome.runtime.sendMessage({
                  type: 'downloadVideo',
                  url: videoSrc,
                  filename: (videoTitle || 'video') + '.mp4'
                }, (response) => {
                  if (response && response.success) {
                    NLM.DOM.showToast('已唤起原生下载，请下载后手动上传', window.innerWidth / 2, 100, true);
                  } else {
                    alert('原生下载唤起失败：' + (response ? response.error : '未知错误'));
                  }
                });
             }
          } else {
             errorMsg += `\n\n错误信息：${err.message}`;
             alert(errorMsg);
          }
          
          NLM.DOM.showToast(i18n.get('videoWmFetchError'), window.innerWidth / 2, 100, false);
        }
      };
    }

    // ===「选择本地文件」按钮 ===
    const pickBtn = overlay.querySelector('#nlmPickFile');
    pickBtn.onclick = async () => {
      const opts = getModalOptions();
      if (!opts) return;

      try {
        const videoData = await pickLocalVideoFile();
        processWithData(videoData, null, opts);
      } catch (err) {
        if (err.message !== '用户取消') {
          NLM.DOM.showToast(i18n.get('videoWmFetchError'), window.innerWidth / 2, 100, false);
        }
      }
    };
  }

  // =============================================
  // 视频文件选择器
  // =============================================

  /**
   * 手动选择本地视频文件
   */
  function pickLocalVideoFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/mp4,video/webm,video/*';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async () => {
        if (input.files && input.files.length > 0) {
          try {
            const buf = await input.files[0].arrayBuffer();
            resolve(buf);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('用户取消'));
        }
        input.remove();
      };

      // 处理用户点击取消
      const onFocus = () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            reject(new Error('用户取消'));
            input.remove();
          }
          window.removeEventListener('focus', onFocus);
        }, 500);
      };
      window.addEventListener('focus', onFocus);

      input.click();
    });
  }

  /**
   * 打开处理页面并传输视频数据
   */
  function openProcessingPage(videoData, videoUrl, options) {
    const params = new URLSearchParams({
      trim: options.trimEnd ? '1' : '0',
      delogo: options.removeFirstFrameWm ? '1' : '0',
      fps: String(options.fps),
      name: encodeURIComponent(options.fileName),
      dur: String(options.duration),
      vw: String(options.videoWidth),
      vh: String(options.videoHeight),
    });

    const url = chrome.runtime.getURL(`processing/index.html?${params.toString()}`);
    processingWindow = window.open(url, '_blank');

    if (!processingWindow) {
      NLM.DOM.showToast(i18n.get('toastPopupBlocked'), window.innerWidth / 2, 100, false);
      return;
    }

    // 监听处理页面就绪信号
    const handler = (event) => {
      if (event.data && event.data.type === 'NLM_PROCESSOR_READY') {
        window.removeEventListener('message', handler);
        
        if (videoData) {
          // 本地文件，使用 Transferable 零拷贝传输
          processingWindow.postMessage(
            { type: 'NLM_VIDEO_DATA', data: videoData },
            '*',
            [videoData]
          );
        } else if (videoUrl) {
          // 远程链接，交由处理页面自行获取
          processingWindow.postMessage(
            { type: 'NLM_VIDEO_URL', url: videoUrl },
            '*'
          );
        }
        console.log(LOG, '指令已发送到处理页面');
      }
    };
    window.addEventListener('message', handler);

    // 超时清理
    setTimeout(() => {
      window.removeEventListener('message', handler);
    }, 30000);
  }

  // === 生命周期与消息监听 ===

  function init() {
    if (isInitialized) return;

    // 监听来自 Popup 的唤起请求
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'showWatermarkModal') {
        showWatermarkModal(null, msg.context);
        sendResponse({ success: true });
      }
    });

    observer = new MutationObserver(() => {
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(injectVideoButton, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 初始扫描
    setTimeout(injectVideoButton, 1000);

    isInitialized = true;
    console.log(LOG, '中枢模块已初始化');
  }

  function destroy() {
    if (observer) {
      clearTimeout(observer._debounce);
      observer.disconnect();
      observer = null;
    }
    document.querySelectorAll('[data-has-nlm-video]').forEach(el => delete el.dataset.hasNlmVideo);
    isInitialized = false;
  }

  return { init, destroy };
})();
