/**
 * NLM Enhancer 视频处理器
 * 在独立标签页中使用 FFmpeg.wasm 处理 NotebookLM 视频水印
 */

(() => {
  const LOG = '[NLM Processor]';
  const isLocalMode = new URLSearchParams(window.location.search).get('mode') === 'local';

  // === FFmpeg 本地路径配置 ===
  const FFMPEG_PATHS = {
    core: '../lib/ffmpeg/ffmpeg-core.js',
    wasm: '../lib/ffmpeg/ffmpeg-core.wasm',
    main: '../lib/ffmpeg/ffmpeg.js'
  };

  // === UI 控制 ===
  const ui = {
    statusCard: () => document.getElementById('statusCard'),
    statusIcon: () => document.getElementById('statusIcon'),
    statusText: () => document.getElementById('statusText'),
    statusDetail: () => document.getElementById('statusDetail'),
    spinner: () => document.getElementById('spinner'),
    progressOuter: () => document.getElementById('progressOuter'),
    progressInner: () => document.getElementById('progressInner'),
    progressText: () => document.getElementById('progressText'),
    doneActions: () => document.getElementById('doneActions'),
    errorCard: () => document.getElementById('errorCard'),
    errorMsg: () => document.getElementById('errorMsg'),
    errorDetail: () => document.getElementById('errorDetail'),
    optionsSummary: () => document.getElementById('optionsSummary'),

    setStatus(icon, text, detail) {
      if (icon) {
        this.statusIcon().textContent = icon;
        this.statusIcon().classList.remove('hidden');
        this.spinner().classList.add('hidden');
      }
      this.statusText().textContent = text;
      if (detail) this.statusDetail().textContent = detail;
    },

    setProgress(percent) {
      this.progressOuter().classList.remove('hidden');
      this.progressText().classList.remove('hidden');
      const p = Math.min(100, Math.max(0, Math.round(percent)));
      this.progressInner().style.width = p + '%';
      this.progressText().textContent = p + '%';
    },

    showDone(filename) {
      this.setStatus('✅', '处理完成！', `文件 "${filename}" 已自动下载`);
      this.setProgress(100);
      this.doneActions().classList.remove('hidden');
      document.title = 'NLM Enhancer - 处理完成 ✅';
    },

    showError(msg, detail) {
      this.statusCard().classList.add('hidden');
      this.errorCard().style.display = 'block';
      this.errorMsg().textContent = msg;
      if (detail) this.errorDetail().textContent = detail;
      document.title = 'NLM Enhancer - 处理失败 ❌';
    },

    renderOptions(options) {
      const tags = [];
      if (options.trimEnd) tags.push('✂️ 剪掉结尾 2.5s');
      if (options.removeFirstFrameWm) tags.push('🧹 去除右下角水印');
      tags.push(options.fps === 15 ? '⚡ 极速 15FPS' : '🎞️ 标准 30FPS');
      this.optionsSummary().innerHTML = tags.map(t => `<span class="opt-tag">${t}</span>`).join('');
    }
  };

  // === 解析 URL 参数 ===
  function getOptions() {
    const params = new URLSearchParams(window.location.search);
    return {
      trimEnd: params.get('trim') === '1',
      removeFirstFrameWm: params.get('delogo') === '1',
      fps: parseInt(params.get('fps')) || 30,
      fileName: decodeURIComponent(params.get('name') || 'video'),
      duration: parseFloat(params.get('dur')) || 0,
      videoWidth: parseInt(params.get('vw')) || 0,
      videoHeight: parseInt(params.get('vh')) || 0,
    };
  }

  // === 加载 FFmpeg ===
  async function loadFFmpeg(options) {
    ui.setStatus(null, '加载处理引擎...', '正在初始化本地 FFmpeg 核心引擎');

    // 1. 加载主脚本
    await loadScript(FFMPEG_PATHS.main);

    const { FFmpeg } = window.FFmpegWASM || window;
    if (!FFmpeg) {
      throw new Error('FFmpeg 库加载失败，请重新安装插件');
    }

    const ffmpeg = new FFmpeg();

    // 2. 加载 core
    ui.setStatus(null, '加载处理引擎...', '正在加载本地 WebAssembly 模块...');
    
    const coreURL = chrome.runtime.getURL('lib/ffmpeg/ffmpeg-core.js');
    const wasmURL = chrome.runtime.getURL('lib/ffmpeg/ffmpeg-core.wasm');

    // 3. 监听日志提取进度
    ffmpeg.on('log', ({ message }) => {
      console.log(LOG, message);
      const timeMatch = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        const totalDur = options.trimEnd ? Math.max(options.duration - 2.5, 1) : options.duration;
        if (totalDur > 0) {
          ui.setProgress((secs / totalDur) * 100);
        }
      }
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (progress > 0 && progress <= 1) {
        ui.setProgress(progress * 100);
      }
    });

    await ffmpeg.load({ coreURL, wasmURL });
    console.log(LOG, 'FFmpeg 加载完成');
    return ffmpeg;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
      document.head.appendChild(s);
    });
  }

  // === 视频处理核心 ===
  async function processVideo(ffmpeg, videoData, options) {
    ui.setStatus(null, '正在处理视频...', '请耐心等待，处理时间取决于视频大小');
    ui.setProgress(0);

    const inputName = 'input.mp4';
    const outputName = 'output.mp4';
    await ffmpeg.writeFile(inputName, new Uint8Array(videoData));

    const args = ['-i', inputName];
    const filters = [];
    let statusMsg = '正在极速剪切视频...';

    if (options.removeFirstFrameWm) {
      if (options.videoWidth && options.videoHeight) {
        const w = Math.round(options.videoWidth * 0.16);
        const h = Math.round(options.videoHeight * 0.08);
        const x = Math.round(options.videoWidth - w - (options.videoWidth * 0.015));
        const y = Math.round(options.videoHeight - h - (options.videoHeight * 0.02));
        filters.push(`delogo=x=${x}:y=${y}:w=${w}:h=${h}`);
        statusMsg = `正在擦除水印 (区域: ${w}x${h})...`;
      } else {
        console.warn(LOG, '无法获取视频尺寸，跳过水印擦除');
      }
    }

    if (options.fps && options.fps !== 30) {
      filters.push(`fps=${options.fps}`);
      statusMsg = options.removeFirstFrameWm ? '正在重采样并擦除水印...' : '正在调整帧率...';
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    if (options.trimEnd && options.duration > 2.5) {
      args.push('-t', String(options.duration - 2.5));
    }

    if (filters.length === 0 && options.trimEnd) {
      args.push('-c', 'copy');
    } else if (filters.length > 0) {
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
      args.push('-c:a', 'copy');
    }

    args.push('-y', outputName);
    
    ui.statusDetail().textContent = statusMsg;

    await ffmpeg.exec(args);
    ui.setStatus(null, '处理完成，正在打包下载...', '请稍候，正在从内存中提取视频数据');
    
    const outputData = await ffmpeg.readFile(outputName);
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (e) {}

    return outputData;
  }

  // === 下载结果 ===
  function downloadResult(data, fileName) {
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName.replace(/\.mp4$/i, '');
    a.download = `${baseName}_nowatermark.mp4`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return a.download;
  }

  // === 辅助：获取视频元数据 ===
  async function getVideoInfo(data) {
    return new Promise((resolve) => {
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      video.src = url;
    });
  }

  // === 主流程 ===
  async function main(videoData, customOptions = null) {
    const options = customOptions || getOptions();
    ui.setProgress(0);

    if (!options.videoWidth || !options.videoHeight || !options.duration) {
      const info = await getVideoInfo(videoData);
      if (info) {
        options.videoWidth = info.width || options.videoWidth;
        options.videoHeight = info.height || options.videoHeight;
        options.duration = info.duration || options.duration;
      }
    }

    ui.renderOptions(options);

    try {
      const ffmpeg = await loadFFmpeg(options);
      const result = await processVideo(ffmpeg, videoData, options);
      if (!result || result.byteLength === 0) throw new Error('生成文件为空');
      const downloadName = downloadResult(result, options.fileName);
      ui.showDone(downloadName);
    } catch (err) {
      ui.showError('视频处理失败', err.message || String(err));
    }
  }

  // === 消息监听 ===
  let dataReceived = false;
  window.addEventListener('message', async (event) => {
    if (dataReceived) return;

    if (event.data && event.data.type === 'NLM_VIDEO_DATA') {
      dataReceived = true;
      ui.setStatus(null, '视频数据已接收', '准备开始处理...');
      main(event.data.data);
    } 
    else if (event.data && event.data.type === 'NLM_VIDEO_URL') {
      dataReceived = true;
      ui.setStatus(null, '正在获取原视频...', '准备下载...');
      try {
        const response = await fetch(event.data.url, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        let loadedBytes = 0;
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loadedBytes += value.length;
          if (totalBytes) {
            ui.setProgress((loadedBytes / totalBytes) * 100);
            ui.setStatus(null, '正在获取原视频...', `已下载: ${(loadedBytes/1024/1024).toFixed(1)}MB / ${(totalBytes/1024/1024).toFixed(1)}MB`);
          }
        }
        
        const videoBuffer = new Uint8Array(loadedBytes);
        let pos = 0;
        for (let chunk of chunks) { videoBuffer.set(chunk, pos); pos += chunk.length; }
        main(videoBuffer.buffer);
      } catch (err) {
        ui.showError('拉取视频失败', err.message);
      }
    }
  });

  // === 统一按钮绑定 ===
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-secondary') || e.target.closest('.nlm-close-page')) {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); else window.close(); });
      } else { window.close(); }
    }
  });

  // === 辅助：本地文件选择器 ===
  function showFilePicker() {
    const configPanel = document.getElementById('localConfigPanel');
    const statusCard = ui.statusCard();
    const warningBanner = document.getElementById('warningBanner');

    // 如果处于显式的本地模式，优化首屏展示
    if (isLocalMode) {
      configPanel.style.display = 'block';
      statusCard.classList.add('hidden');
      warningBanner.classList.add('hidden');
      document.querySelector('.subtitle').textContent = '请先配置处理参数，然后选择本地视频文件';
    } else {
      // 自动模式下的降级显示
      ui.setStatus('📁', '等待本地文件...', '请选择您想要处理的本地视频');
      const statusDetail = ui.statusDetail();
      statusDetail.innerHTML = '';
      
      const pickBtn = document.createElement('button');
      pickBtn.className = 'btn btn-primary';
      pickBtn.textContent = '📂 选择本地视频';
      pickBtn.style.marginTop = '10px';
      statusDetail.appendChild(pickBtn);
      
      pickBtn.onclick = () => triggerFileInput();
    }

    const localPickBtn = document.getElementById('localPickBtn');
    if (localPickBtn) localPickBtn.onclick = () => triggerFileInput();

    function triggerFileInput() {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'video/mp4,video/x-m4v,video/*';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
          dataReceived = true;
          
          // 从面板读取最新配置（如果是本地模式）
          let currentOptions = getOptions();
          if (isLocalMode) {
            currentOptions.trimEnd = document.getElementById('localOptTrim').checked;
            currentOptions.removeFirstFrameWm = document.getElementById('localOptDelogo').checked;
            currentOptions.fps = parseInt(document.getElementById('localFpsSelect').value);
            
            // 切换 UI 状态到处理中
            configPanel.style.display = 'none';
            statusCard.classList.remove('hidden');
            warningBanner.classList.remove('hidden');
            document.querySelector('.subtitle').textContent = '100% 本地处理，数据不离开浏览器';
          }

          ui.setStatus(null, '本地视频已加载', `文件名: ${file.name}`);
          
          // 更新 URL 参数以备后用（可选）
          const params = new URLSearchParams(window.location.search);
          params.set('name', file.name);
          window.history.replaceState({}, '', '?' + params.toString());
          
          main(ev.target.result, currentOptions);
        };
        reader.readAsArrayBuffer(file);
        fileInput.remove();
      };
      fileInput.click();
    }
  }

  if (window.opener) {
    window.opener.postMessage({ type: 'NLM_PROCESSOR_READY' }, '*');
  }

  // 检查是否为显式的本地模式
  if (isLocalMode) {
    showFilePicker();
  } else {
    // 自动抓取模式：如果 2秒内没有收到数据，则显示手动上传按钮作为防线
    setTimeout(() => {
      if (!dataReceived) {
        showFilePicker();
      }
    }, 2000);
  }
})();
