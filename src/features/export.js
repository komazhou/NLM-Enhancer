/**
 * NLM Enhancer 对话导出模块
 * 将当前对话导出为 Markdown 文件，并提供纯净的 LaTeX 预览复制
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.Export = (() => {
  const LOG = '[NLM Enhancer Export]';

  // === Iframe 安全门 ===
  if (window.self !== window.top) {
    function decodeHtmlEntities(text) {
      if (!text) return '';
      const textArea = document.createElement('textarea');
      textArea.innerHTML = text;
      return textArea.value;
    }

    function tryPushData() {
      try {
        const appRoot = document.querySelector('app-root');
        if (appRoot && appRoot.hasAttribute('data-app-data')) {
          let appDataStr = appRoot.getAttribute('data-app-data');
          if (appDataStr) {
            // 解码 HTML 实体（如 &quot; -> "）
            appDataStr = decodeHtmlEntities(appDataStr);
            const appData = JSON.parse(appDataStr);
            
            const quizList = appData.quiz || appData.questions || [];
            const flashList = appData.flashcards || appData.cards || [];

            let cards = [];
            if (flashList.length > 0) {
              cards = flashList.map(c => ({
                front: c.f || c.front || '',
                back: c.b || c.back || ''
              }));
            } else if (quizList.length > 0) {
              cards = quizList.map(q => {
                const text = q.q || q.question || '';
                const opts = q.answerOptions || q.options || [];
                const options = opts.map(opt => opt.text || opt).join(' | ');
                const answerObj = opts.find(opt => opt.isCorrect);
                const answer = answerObj ? (answerObj.text || answerObj) : '';
                const rationale = answerObj ? (answerObj.rationale || '') : '';
                const hint = q.hint || '';
                return { 
                  question: text, 
                  options, 
                  answer, 
                  rationale, 
                  hint,
                  rawOptions: opts // 保留原始数组用于 Anki 富文本生成
                };
              });
            }

            if (cards.length > 0) {
              window.top.postMessage({ 
                type: 'NLM_DATA_SYNC', 
                data: appData,
                processedCards: cards 
              }, '*');
              return true;
            }
          }
        }
      } catch (e) { console.error(LOG, 'Push error:', e); }
      return false;
    }

    // 持续监控 app-root 的出现
    const observer = new MutationObserver(() => {
      if (tryPushData()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    
    // 同时也响应主页面的手动请求
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NLM_GET_CARD_DATA') {
        tryPushData();
      }
    });

    return { init() {}, destroy() {}, htmlToMarkdown() { return ''; }, extractCleanHtml() { return ''; }, openStashPreview() {} };
  }

  // === 主页面全局变量 ===
  let latestAppData = null;
  let latestProcessedCards = [];
  
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NLM_DATA_SYNC') {
      latestAppData = event.data.data;
      latestProcessedCards = event.data.processedCards || [];
      console.log(LOG, 'App data synced:', latestProcessedCards.length, 'cards');
      
      const countEl = document.querySelector('.nlm-card-count');
      if (countEl) {
        countEl.textContent = `${latestProcessedCards.length} 张卡片`;
      }
    }
  });

  // === 以下为主页面逻辑 ===

  // --- 重构：健壮的 HTML 转 Markdown 解析引擎 ---

  function htmlToMarkdown(element) {
    function walk(node, listDepth = 0) {
      // 1. 纯文本节点直接返回
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      // 2. 拦截并处理 LaTeX 公式烙印
      if (node.hasAttribute('data-nlm-latex')) {
        const latex = node.getAttribute('data-nlm-latex');
        const isBlock = node.closest('.katex-display') !== null || node.classList.contains('katex-display');
        return isBlock ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
      }

      const tag = node.tagName.toLowerCase();

      // 3. 核心修复：针对 ul 和 ol 列表进行专属接管，避免子节点被错误加圆点
      if (tag === 'ul' || tag === 'ol') {
        let listOut = '';
        let liIndex = 1;
        for (const child of node.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
            const indent = '  '.repeat(listDepth);
            const bullet = tag === 'ol' ? `${liIndex++}. ` : '* ';
            const itemContent = walk(child, listDepth + 1).trim();
            // 如果列表项内有多段文本，保护换行的缩进格式不断层
            const cleanedContent = itemContent.replace(/\n+/g, '\n' + indent + '  ');
            listOut += `\n${indent}${bullet}${cleanedContent}`;
          } else if (child.nodeType === Node.ELEMENT_NODE || (child.nodeType === Node.TEXT_NODE && child.textContent.trim())) {
            listOut += walk(child, listDepth);
          }
        }
        return `\n${listOut}\n`;
      }

      // 4. 常规元素遍历子节点
      let childContent = '';
      for (const child of node.childNodes) {
        childContent += walk(child, listDepth);
      }

      // 5. 格式包裹（根据标签名翻译为 Markdown 语法）
      if (tag === 'strong' || tag === 'b') {
        return childContent.trim() ? `**${childContent}**` : '';
      } else if (tag === 'em' || tag === 'i') {
        return childContent.trim() ? `*${childContent}*` : '';
      } else if (tag === 'code' && !node.closest('pre')) {
        return `\`${childContent}\``;
      } else if (tag === 'p' || tag === 'div') {
        return `\n\n${childContent}\n\n`;
      } else if (tag === 'br') {
        return `\n`;
      } else if (tag === 'pre') {
        return `\n\`\`\`\n${childContent.trim()}\n\`\`\`\n`;
      } else if (tag.match(/^h[1-6]$/)) {
        return `\n\n${'#'.repeat(parseInt(tag[1]))} ${childContent.trim()}\n\n`;
      }

      return childContent;
    }

    // 最终清理多余的三重以上连续换行，保持版面干净
    return walk(element)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }


  function extractCleanHtml(element) {
    const clone = element.cloneNode(true);
    const removeTexts = [
      "keep_pin", "保存到笔记", "copy_all", "thumb_up", "thumb_down", "content_copy", 
      "good_response", "bad_response", "more_horiz", "expand_more", "expand_less", 
      "check", "landscape_2", "photo_spark", "keep", "more_vert",
      "expand_content", "collapse_content", "file_download", "edit"
    ];
    
    // 移除报告特有的头部和副标题区域，避免重复
    clone.querySelectorAll('.artifact-header, .artifact-subtitle, .artifact-feedback-container').forEach(el => el.remove());
    
    clone.querySelectorAll("mat-icon, .mat-icon, button, a, .citation-marker, .source-annotation, .suggestions-container, .mat-mdc-card-actions").forEach(el => {
      const txt = el.textContent.trim();
      if (removeTexts.includes(txt) || /^[\d,\s·]+$/.test(txt) || 
          el.classList.contains("citation-marker") || el.classList.contains("source-annotation") ||
          el.classList.contains("suggestions-container") || el.classList.contains("mat-mdc-card-actions")) {
        (el.closest("button") || el.closest(".citation-marker") || el.closest(".source-annotation") || 
         el.closest(".suggestions-container") || el.closest(".mat-mdc-card-actions") || el).remove();
      }
    });

    clone.querySelectorAll("sup, [data-citation], .citation").forEach(el => el.remove());

    if (NLM.FormulaCopy && NLM.FormulaCopy.extractLatex) {
      clone.querySelectorAll('.katex, [data-math], mjx-container, .MathJax, math').forEach(el => {
        const latex = NLM.FormulaCopy.extractLatex(el);
        if (latex) el.setAttribute('data-nlm-latex', latex);
      });
    }

    return clone.innerHTML;
  }
  /**
   * 通用文件下载辅助函数
   */
  function downloadBlob(content, filename, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function downloadMarkdownFromPreview(doc, defaultTitle) {
    const currentTitle = doc.getElementById('editableTitle').innerText.trim() || defaultTitle;
    const lines = [];
    const metaEl = doc.querySelector('.meta');
    lines.push('# ' + currentTitle);
    if (metaEl && metaEl.innerText) {
      lines.push('> ' + metaEl.innerText);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    
    doc.querySelectorAll('.msg-pair').forEach(pair => {
      const isUser = pair.querySelector('.user') !== null;
      const role = isUser ? NLM.i18n.get('mdRoleUser') : NLM.i18n.get('mdRoleModel');
      const contentEl = pair.querySelector('.content').cloneNode(true);
      
      const finalMarkdownText = htmlToMarkdown(contentEl);
      
      lines.push('## ' + role);
      lines.push('');
      lines.push(finalMarkdownText);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    
    const finalMd = lines.join('\n');
    const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8' });
    const a = doc.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    
    const date = new Date().toISOString().slice(0, 10);
    const safeFilename = currentTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 50);
    a.download = `${safeFilename}_${date}.md`; 
    a.click();
  }

  function downloadWordFromPreview(doc, defaultTitle) {
    const currentTitle = doc.getElementById('editableTitle').innerText.trim() || defaultTitle;
    // 克隆消息容器以进行清理
    const containerClone = doc.getElementById('messages-container').cloneNode(true);
    // 移除所有删除按钮
    containerClone.querySelectorAll('.delete-btn').forEach(el => el.remove());

    const contentHtml = containerClone.innerHTML;
    const metaText = doc.querySelector('.meta') ? doc.querySelector('.meta').innerText : '';
    
    // 构建 Word 兼容的 HTML 模板
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${currentTitle}</title>
        <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; color: #1f1f1f; }
          h1 { text-align: center; color: #1a73e8; font-size: 22pt; margin-bottom: 5pt; }
          .meta { text-align: center; color: #70757a; font-size: 10pt; margin-bottom: 30pt; }
          .msg-pair { margin-bottom: 15pt; border-bottom: 0.5pt solid #dadce0; padding-bottom: 10pt; }
          .role { font-weight: bold; color: #5f6368; font-size: 9pt; text-transform: uppercase; margin-bottom: 4pt; }
          .user { background-color: #f8f9fa; padding: 10pt; border-left: 3pt solid #1a73e8; }
          .model { background-color: #ffffff; padding: 10pt; }
          .content { font-size: 11pt; }
          pre { background-color: #f1f3f4; padding: 8pt; border-radius: 4pt; font-family: 'Consolas', 'Courier New', monospace; font-size: 10pt; }
          code { background-color: #f1f3f4; font-family: 'Consolas', 'Courier New', monospace; }
          ul, ol { margin-left: 20pt; }
        </style>
      </head>
      <body>
        <h1>${currentTitle}</h1>
        <div class="meta">${metaText}</div>
        <div id="messages-container">${contentHtml}</div>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().slice(0, 10);
    const safeFilename = currentTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 50);
    a.download = `${safeFilename}_${date}.doc`;
    a.click();
  }

  function openExportPreview() {
    const messages = NLM.DOM.findAllMessages();
    if (messages.length === 0) {
      NLM.DOM.showToast(NLM.i18n.get('toastNoConversation'), window.innerWidth / 2, 100, false);
      return;
    }
    
    // 尝试获取笔记本标题
    let notebookTitle = document.title;
    const notebookNameEl = document.querySelector('.notebook-name, [aria-label="Notebook name"]');
    if (notebookNameEl) {
      notebookTitle = notebookNameEl.innerText.trim();
    } else if (notebookTitle.includes(' - NotebookLM')) {
      notebookTitle = notebookTitle.replace(' - NotebookLM', '');
    }
    
    const defaultTitle = notebookTitle || NLM.i18n.get('exportDefaultTitle');
    const date = new Date().toISOString().slice(0, 10);
    
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${NLM.i18n.get('exportPreviewTitle', [document.title])}</title>
          <link rel="stylesheet" href="${chrome.runtime.getURL('lib/katex.min.css')}">
          <style>
            body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 0; color: #1f1f1f; }
            .toolbar { position: sticky; top: 0; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); padding: 12px 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
            .toolbar-title { font-size: 16px; font-weight: 600; color: #1a73e8; }
            .btn-group { display: flex; gap: 12px; }
            button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
            .btn-md { background: #fff; border: 1px solid #dadce0; color: #3c4043; }
            .btn-md:hover { background: #f8f9fa; border-color: #bdc1c6; }
            .btn-word { background: #e8f0fe; border: 1px solid #1a73e8; color: #1a73e8; }
            .btn-word:hover { background: #d2e3fc; }
            .btn-pdf { background: #1a73e8; color: white; }
            .btn-pdf:hover { background: #1765cc; }
            
            .preview-container { max-width: 850px; margin: 30px auto; background: #fff; padding: 50px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; position: relative; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 8px; font-weight: 700; border-radius: 4px; padding: 4px; transition: background 0.2s; outline: none; }
            h1[contenteditable="true"]:hover { background: #f1f3f4; cursor: text; }
            h1[contenteditable="true"]:focus { background: #fff; box-shadow: 0 0 0 2px #1a73e8; }
            .meta { text-align: center; color: #70757a; font-size: 13px; margin-bottom: 50px; }
            
            .msg-pair { position: relative; margin-bottom: 20px; border-radius: 12px; transition: background 0.2s; }
            .msg-pair:hover { background: #fdfdfd; }
            
            .msg { padding: 12px 20px; border-radius: 8px; margin-bottom: 10px; }
            .user { background: #f8f9fa; border-left: 4px solid #1a73e8; }
            .model { background: #fff; border-bottom: 1px solid #f1f3f4; }
            .role { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: #5f6368; text-transform: uppercase; }
            .content { font-size: 15px; line-height: 1.7; }
            
            /* 精准删除遮罩样式 */
            .nlm-delete-mask {
              position: absolute; display: none; background: rgba(234, 67, 53, 0.15);
              border: 1px solid #ea4335; pointer-events: none; z-index: 10000;
              align-items: center; justify-content: center;
              border-radius: 2px; box-sizing: border-box;
            }
            .nlm-delete-label {
              position: fixed; background: rgba(31, 31, 31, 0.9); color: white; padding: 6px 12px;
              border-radius: 4px; font-size: 11px; font-weight: 500; display: none;
              align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              pointer-events: none; white-space: nowrap; z-index: 10001;
              transform: translate(15px, 15px);
            }
            .nlm-delete-label svg { width: 14px; height: 14px; stroke: white; }
            
            /* 模式切换按钮样式与垃圾桶光标 */
            .btn-mode-toggle { background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; }
            .btn-mode-toggle.active { background: #fce8e6; color: #d93025; border-color: #f19f97; }
            
            .nlm-delete-target-hover {
              cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>') 12 12, crosshair !important;
            }
            
            @media print {
              .toolbar, .nlm-delete-mask { display: none !important; }
              .preview-container { box-shadow: none; margin: 0; padding: 20px; width: 100%; max-width: none; }
              .msg-pair { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="toolbar-title">${NLM.i18n.get('exportToolbarTitle')}</div>
            <div class="btn-group">
              <button id="toggleDeleteMode" class="btn-mode-toggle active" title="开启后可通过红色遮罩精准删除内容">✂️ 精准删除模式</button>
              <button class="btn-md" id="downloadMdBtn">${NLM.i18n.get('btnDownloadMd')}</button>
              <button class="btn-word" id="downloadWordBtn">${NLM.i18n.get('btnSaveWord')}</button>
              <button class="btn-pdf" id="downloadPdfBtn">${NLM.i18n.get('btnSavePdf')}</button>
            </div>
          </div>
          <div class="preview-container">
            <h1 id="editableTitle" contenteditable="true" title="${NLM.i18n.get('clickToEdit', ['点击修改标题'])}">${defaultTitle}</h1>
            <div class="meta">${NLM.i18n.get('exportTime', [new Date().toLocaleString()])}</div>
            <div id="messages-container">
    `;
    
    messages.forEach((msg, idx) => {
      const roleName = msg.type === "user" ? NLM.i18n.get('roleUser') : NLM.i18n.get('roleModel');
      const roleClass = msg.type === "user" ? "user" : "model";
      const cleanHtml = extractCleanHtml(msg.element);
      html += `
        <div class="msg-pair" data-idx="${idx}">
          <div class="msg ${roleClass}">
            <div class="role">${roleName}</div>
            <div class="content">${cleanHtml}</div>
          </div>
        </div>`;
    });
    
    html += `
            </div>
          </div>
        </body>
      </html>
    `;
    
    const win = window.open("", "_blank");
    if (!win) {
      NLM.DOM.showToast(NLM.i18n.get('toastPopupBlocked'), window.innerWidth / 2, 100, false);
      return;
    }
    
    win.document.write(html);
    win.document.close();
    const doc = win.document;

    const pdfBtn = doc.getElementById('downloadPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        win.print();
      });
    }

    const wordBtn = doc.getElementById('downloadWordBtn');
    if (wordBtn) {
      wordBtn.addEventListener('click', () => {
        downloadWordFromPreview(doc, defaultTitle);
      });
    }

    // --- 精准删除 (光标跟随模式) 逻辑 ---
    const mask = doc.createElement('div');
    mask.className = 'nlm-delete-mask';
    doc.body.appendChild(mask);

    const label = doc.createElement('div');
    label.className = 'nlm-delete-label';
    label.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>${NLM.i18n.get('btnDeleteMessage') || 'Click to delete'}`;
    doc.body.appendChild(label);

    let isDeleteMode = true; 
    let currentTarget = null;

    const toggleBtn = doc.getElementById('toggleDeleteMode');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        isDeleteMode = !isDeleteMode;
        toggleBtn.classList.toggle('active', isDeleteMode);
        doc.body.style.cursor = isDeleteMode ? 'crosshair' : 'default';
        if (!isDeleteMode) {
          mask.style.display = 'none';
          label.style.display = 'none';
        }
      });
      doc.body.style.cursor = 'crosshair';
    }

    doc.addEventListener('mouseover', (e) => {
      if (!isDeleteMode) return;
      
      const target = e.target;
      const isInside = target.closest('#messages-container') || target.closest('.preview-container h1') || target.closest('.preview-container .meta');
      
      if (isInside && target.id !== 'messages-container') {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        currentTarget = target;
        currentTarget.classList.add('nlm-delete-target-hover');
        
        const rect = target.getBoundingClientRect();
        mask.style.display = 'block';
        mask.style.top = (rect.top + win.scrollY) + 'px';
        mask.style.left = (rect.left + win.scrollX) + 'px';
        mask.style.width = rect.width + 'px';
        mask.style.height = rect.height + 'px';
        label.style.display = 'flex';
      } else {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    });

    doc.addEventListener('mousemove', (e) => {
      if (isDeleteMode && currentTarget) {
        label.style.left = e.clientX + 'px';
        label.style.top = e.clientY + 'px';
      }
    });

    doc.addEventListener('click', (e) => {
      if (isDeleteMode && currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        currentTarget.remove();
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    }, true);

    const mdBtn = doc.getElementById('downloadMdBtn');
    if (mdBtn) {
      mdBtn.addEventListener('click', () => {
        downloadMarkdownFromPreview(doc, defaultTitle);
      });
    }

    doc.addEventListener('copy', (event) => {
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const fragment = sel.getRangeAt(0).cloneContents();
      if (!fragment.querySelector('.katex, [data-nlm-latex]')) return;
      
      event.preventDefault();
      const div = doc.createElement('div');
      div.appendChild(fragment);

      div.querySelectorAll('[data-nlm-latex]').forEach(el => {
        const latex = el.getAttribute('data-nlm-latex');
        if (latex) {
          const isBlock = el.closest('.katex-display') !== null || el.classList.contains('katex-display');
          el.replaceWith(doc.createTextNode(isBlock ? "\n\\[ " + latex + " \\]\n" : "$" + latex + "$"));
        } else {
          el.remove();
        }
      });
      
      let text = (div.innerText || div.textContent || '').replace(/[\u00B0\u2022\u2219\u25CF]/g, '').trim();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', div.innerHTML);
    });
  }

  let isInitialized = false;
  let posTimer = null;
  let exportBtn = null;
  let studioObserver = null;



  function update() {
    if (exportBtn) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect && rect.width > 0) {
          exportBtn.style.left = (rect.right - exportBtn.offsetWidth) + "px";
          exportBtn.style.top = (rect.top - exportBtn.offsetHeight) + "px";
        }
      }
    }
    // 持续检测 Studio 面板展开状态（样式变化不会触发 MutationObserver）
    checkStudioExpanded();
    posTimer = requestAnimationFrame(update);
  }

  function init() {
    if (isInitialized) return;
    exportBtn = document.createElement("button");
    exportBtn.className = "nlm-export-btn";
    exportBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>${NLM.i18n.get('btnExport')}</span>
    `;
    exportBtn.onclick = openExportPreview;
    document.body.appendChild(exportBtn);
    update();

    studioObserver = new MutationObserver(() => {
      clearTimeout(studioObserver._debounceTimer);
      studioObserver._debounceTimer = setTimeout(() => {
        injectStudioExportButton();
      }, 500);
    });
    studioObserver.observe(document.body, { childList: true, subtree: true });

    isInitialized = true;
  }

  function destroy() {
    if (exportBtn) exportBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    if (studioObserver) { clearTimeout(studioObserver._debounceTimer); studioObserver.disconnect(); }
    document.querySelectorAll('.nlm-studio-export-btn').forEach(btn => btn.remove());
    document.querySelectorAll('[data-has-nlm-export]').forEach(el => delete el.dataset.hasNlmExport);
    document.body.classList.remove('nlm-studio-expanded');
    isInitialized = false;
  }

  /**
   * 检测 Studio 面板是否处于展开状态
   * 检测条件（满足任一即判定为展开）：
   * 1. studio-panel 宽度超过视口 60%
   * 2. artifact-viewer 或 slide 查看器覆盖了视口大部分区域
   * 3. chat-panel 不可见（被完全遮挡或隐藏）
   */
  function checkStudioExpanded() {
    let expanded = false;
    
    // 条件 1：studio-panel 宽度占比检测
    const studioPanel = document.querySelector('.studio-panel');
    if (studioPanel && studioPanel.offsetWidth / window.innerWidth > 0.6) {
      expanded = true;
    }
    
    // 条件 2：artifact-viewer 或 slide 查看器的宽度检测
    if (!expanded) {
      const artifactViewer = document.querySelector('artifact-viewer, .artifact-viewer-container');
      if (artifactViewer && artifactViewer.offsetWidth / window.innerWidth > 0.5) {
        expanded = true;
      }
    }
    
    // 条件 3：chat-panel 被隐藏或宽度极小
    if (!expanded) {
      const chatPanel = document.querySelector('.chat-panel');
      if (chatPanel && chatPanel.offsetWidth < 100 && studioPanel && studioPanel.offsetWidth > 0) {
        expanded = true;
      }
    }
    
    document.body.classList.toggle('nlm-studio-expanded', expanded);
  }

  /**
   * 打开暂存内容的合并预览窗口（供 StashCart 模块调用）
   * 复用与全量导出相同的预览 UI
   * @param {Array} stashItems - 暂存数据数组 [{id, markdown, userMarkdown, modelMarkdown, timestamp, ...}]
   */
  function openStashPreview(stashItems) {
    if (!stashItems || stashItems.length === 0) return;

    // 尝试获取笔记本标题
    let notebookTitle = document.title;
    const notebookNameEl = document.querySelector('.notebook-name, [aria-label="Notebook name"]');
    if (notebookNameEl) {
      notebookTitle = notebookNameEl.innerText.trim();
    } else if (notebookTitle.includes(' - NotebookLM')) {
      notebookTitle = notebookTitle.replace(' - NotebookLM', '');
    }
    
    // 初始预览标题：笔记本名称 + 知识购物车
    const defaultTitle = `${notebookTitle} - ${NLM.i18n.get('cartPanelTitle')}`;
    
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${NLM.i18n.get('exportPreviewTitle', [document.title])}</title>
          <link rel="stylesheet" href="${chrome.runtime.getURL('lib/katex.min.css')}">
          <style>
            body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 0; color: #1f1f1f; }
            .toolbar { position: sticky; top: 0; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); padding: 12px 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
            .toolbar-title { font-size: 16px; font-weight: 600; color: #1a73e8; }
            .btn-group { display: flex; gap: 12px; }
            button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
            .btn-md { background: #fff; border: 1px solid #dadce0; color: #3c4043; }
            .btn-md:hover { background: #f8f9fa; border-color: #bdc1c6; }
            .btn-word { background: #e8f0fe; border: 1px solid #1a73e8; color: #1a73e8; }
            .btn-word:hover { background: #d2e3fc; }
            .btn-pdf { background: #1a73e8; color: white; }
            .btn-pdf:hover { background: #1765cc; }
            .preview-container { max-width: 850px; margin: 30px auto; background: #fff; padding: 50px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; position: relative; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 8px; font-weight: 700; border-radius: 4px; padding: 4px; transition: background 0.2s; outline: none; }
            h1[contenteditable="true"]:hover { background: #f1f3f4; cursor: text; }
            h1[contenteditable="true"]:focus { background: #fff; box-shadow: 0 0 0 2px #1a73e8; }
            .meta { text-align: center; color: #70757a; font-size: 13px; margin-bottom: 50px; }
            .msg-pair { position: relative; margin-bottom: 20px; border-radius: 12px; transition: background 0.2s; }
            .msg-pair:hover { background: #fdfdfd; }
            
            .msg { padding: 12px 20px; border-radius: 8px; margin-bottom: 10px; }
            .user { background: #f8f9fa; border-left: 4px solid #1a73e8; }
            .model { background: #fff; border-bottom: 1px solid #f1f3f4; }
            .role { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: #5f6368; text-transform: uppercase; }
            .content { font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
            pre { background: #f1f3f4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; }
            
            /* 精准删除遮罩样式 */
            .nlm-delete-mask {
              position: absolute; display: none; background: rgba(234, 67, 53, 0.15);
              border: 1px solid #ea4335; pointer-events: none; z-index: 10000;
              align-items: center; justify-content: center;
              border-radius: 2px; box-sizing: border-box;
            }
            .nlm-delete-label {
              position: fixed; background: rgba(31, 31, 31, 0.9); color: white; padding: 6px 12px;
              border-radius: 4px; font-size: 11px; font-weight: 500; display: none;
              align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              pointer-events: none; white-space: nowrap; z-index: 10001;
              transform: translate(15px, 15px);
            }
            .nlm-delete-label svg { width: 14px; height: 14px; stroke: white; }
            
            /* 模式切换按钮样式与垃圾桶光标 */
            .btn-mode-toggle { background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; }
            .btn-mode-toggle.active { background: #fce8e6; color: #d93025; border-color: #f19f97; }
            
            .nlm-delete-target-hover {
              cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>') 12 12, crosshair !important;
            }
            
            .stash-divider { border: none; border-top: 2px dashed #dadce0; margin: 30px 0; }
            @media print {
              .toolbar, .nlm-delete-mask { display: none !important; }
              .preview-container { box-shadow: none; margin: 0; padding: 20px; width: 100%; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="toolbar-title">${NLM.i18n.get('cartPanelTitle')}</div>
            <div class="btn-group">
              <button id="toggleDeleteMode" class="btn-mode-toggle active" title="开启后可通过红色遮罩精准删除内容">✂️ 精准删除模式</button>
              <button class="btn-md" id="downloadMdBtn">${NLM.i18n.get('btnDownloadMd')}</button>
              <button class="btn-word" id="downloadWordBtn">${NLM.i18n.get('btnSaveWord')}</button>
              <button class="btn-pdf" id="downloadPdfBtn">${NLM.i18n.get('btnSavePdf')}</button>
            </div>
          </div>
          <div class="preview-container">
            <h1 id="editableTitle" contenteditable="true" title="${NLM.i18n.get('clickToEdit', ['点击修改标题'])}">${defaultTitle}</h1>
            <div class="meta">${NLM.i18n.get('exportTime', [new Date().toLocaleString()])} · ${NLM.i18n.get('stashItemCount', [String(stashItems.length)])}</div>
            <div id="messages-container">
    `;

    stashItems.forEach((item, idx) => {
      if (item.userHtml || item.userMarkdown) {
        const contentToShow = item.userHtml ? item.userHtml : escapeHtmlForPreview(item.userMarkdown);
        html += `
          <div class="msg-pair" data-idx="${idx}-user">
            <div class="msg user">
              <div class="role">${NLM.i18n.get('roleUser')}</div>
              <div class="content">${contentToShow}</div>
            </div>
          </div>`;
      }
      if (item.modelHtml || item.modelMarkdown) {
        const contentToShow = item.modelHtml ? item.modelHtml : escapeHtmlForPreview(item.modelMarkdown);
        html += `
          <div class="msg-pair" data-idx="${idx}-model">
            <div class="msg model">
              <div class="role">${NLM.i18n.get('roleModel')}</div>
              <div class="content">${contentToShow}</div>
            </div>
          </div>`;
      }
      if (idx < stashItems.length - 1) {
        html += `<hr class="stash-divider">`;
      }
    });

    html += `
            </div>
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) {
      NLM.DOM.showToast(NLM.i18n.get('toastPopupBlocked'), window.innerWidth / 2, 100, false);
      return;
    }

    win.document.write(html);
    win.document.close();
    const doc = win.document;

    // PDF
    const pdfBtn = doc.getElementById('downloadPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => win.print());

    const wordBtn = doc.getElementById('downloadWordBtn');
    if (wordBtn) {
      wordBtn.addEventListener('click', () => {
        downloadWordFromPreview(doc, defaultTitle);
      });
    }

    // --- 精准删除 (光标跟随模式) 逻辑 ---
    const mask = doc.createElement('div');
    mask.className = 'nlm-delete-mask';
    doc.body.appendChild(mask);

    const label = doc.createElement('div');
    label.className = 'nlm-delete-label';
    label.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>${NLM.i18n.get('btnDeleteMessage') || 'Click to delete'}`;
    doc.body.appendChild(label);

    let isDeleteMode = true; 
    let currentTarget = null;

    const toggleBtn = doc.getElementById('toggleDeleteMode');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        isDeleteMode = !isDeleteMode;
        toggleBtn.classList.toggle('active', isDeleteMode);
        doc.body.style.cursor = isDeleteMode ? 'crosshair' : 'default';
        if (!isDeleteMode) {
          mask.style.display = 'none';
          label.style.display = 'none';
        }
      });
      doc.body.style.cursor = 'crosshair';
    }

    doc.addEventListener('mouseover', (e) => {
      if (!isDeleteMode) return;
      
      const target = e.target;
      const isInside = target.closest('#messages-container') || target.closest('.preview-container h1') || target.closest('.preview-container .meta');
      
      if (isInside && target.id !== 'messages-container') {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        currentTarget = target;
        currentTarget.classList.add('nlm-delete-target-hover');
        
        const rect = target.getBoundingClientRect();
        mask.style.display = 'block';
        mask.style.top = (rect.top + win.scrollY) + 'px';
        mask.style.left = (rect.left + win.scrollX) + 'px';
        mask.style.width = rect.width + 'px';
        mask.style.height = rect.height + 'px';
        label.style.display = 'flex';
      } else {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    });

    doc.addEventListener('mousemove', (e) => {
      if (isDeleteMode && currentTarget) {
        label.style.left = e.clientX + 'px';
        label.style.top = e.clientY + 'px';
      }
    });

    doc.addEventListener('click', (e) => {
      if (isDeleteMode && currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        currentTarget.remove();
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    }, true);

    // Markdown 下载
    const mdBtn = doc.getElementById('downloadMdBtn');
    if (mdBtn) {
      mdBtn.addEventListener('click', () => {
        downloadMarkdownFromPreview(doc, defaultTitle);
      });
    }
  }

  /**
   * 简易 HTML 转义（用于预览窗口中展示 Markdown 文本）
   */
  function escapeHtmlForPreview(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function injectStudioExportButton() {
    // 1. 笔记底部注入
    const noteFooters = document.querySelectorAll('.studio-panel .panel-footer.note-view-footer:not([data-has-nlm-export])');
    noteFooters.forEach(footer => {
      footer.dataset.hasNlmExport = 'true';
      const btn = createExportBtn('导出笔记', () => {
        const panel = footer.closest('.studio-panel');
        if (panel) openArtifactExportPreview(panel);
      });
      footer.appendChild(btn); 
    });

    // 2. 报告底部注入
    const artifactFooters = document.querySelectorAll('.artifact-viewer-container .artifact-footer:not([data-has-nlm-export])');
    artifactFooters.forEach(footer => {
      const viewer = footer.closest('.artifact-viewer-container') || footer.closest('artifact-viewer');
      if (!viewer) return;
      
      // A. 报告类型 (Report)
      if (viewer.querySelector('report-viewer')) {
        footer.dataset.hasNlmExport = 'true';
        const btn = createExportBtn('导出报告', () => {
          openArtifactExportPreview(viewer);
        });
        footer.appendChild(btn);
        return;
      }
      
      // B. 应用类型 (闪卡 Flashcard / 测验 Quiz) - 它们都在 app-viewer 的 iframe 里
      const appViewer = viewer.querySelector('app-viewer');
      if (appViewer) {
        footer.dataset.hasNlmExport = 'true';
        // 尝试通过标题或内容猜测类型
        const title = viewer.querySelector('.artifact-title')?.value || '';
        const isQuiz = title.includes('测验') || title.toLowerCase().includes('quiz');
        const label = isQuiz ? '导出测验' : '导出闪卡';
        
        const btn = createExportBtn(label, () => {
          showCardExportModal(viewer, isQuiz ? 'quiz' : 'flashcard');
        });
        footer.appendChild(btn);
      }
    });
  }


  /**
   * 显示卡片/测验导出专用弹窗
   */
  function showCardExportModal(container, type) {
    const titleInput = container.querySelector('input.artifact-title');
    const sourceTitle = titleInput ? titleInput.value.trim() : (type === 'flashcard' ? '闪卡' : '测验');
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'nlm-modal-overlay';
    
    // 从全局缓存获取数量
    let cardCount = 0;
    if (latestAppData) {
      cardCount = (latestAppData.quiz || latestAppData.flashcards || []).length;
    }

    const modalHtml = `
      <div class="nlm-modal">
        <div class="nlm-modal-header">
          <div class="nlm-modal-title">
            <span style="font-size: 20px;">${type === 'flashcard' ? '🎴' : '📝'}</span>
            <span>导出${type === 'flashcard' ? '闪卡' : '测验'}</span>
          </div>
          <div class="nlm-modal-close">
            <mat-icon class="material-symbols-outlined">close</mat-icon>
          </div>
        </div>
        <div class="nlm-modal-body">
          <div class="nlm-source-info">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span class="nlm-source-label">来源：${sourceTitle}</span>
            </div>
            <span class="nlm-card-count">${cardCount || '--'} 张卡片</span>
          </div>
          
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 12px; color: #5f6368;">导出格式</div>
          <div class="nlm-format-grid">
            <div class="nlm-format-option selected" data-format="csv">
              <span class="nlm-format-icon">📊</span>
              <span class="nlm-format-name">CSV</span>
              <span class="nlm-format-desc">通用表格</span>
            </div>
            <div class="nlm-format-option" data-format="md">
              <span class="nlm-format-icon">📝</span>
              <span class="nlm-format-name">Markdown</span>
              <span class="nlm-format-desc">笔记应用</span>
            </div>
            <div class="nlm-format-option" data-format="anki">
              <span class="nlm-format-icon">🧠</span>
              <span class="nlm-format-name">Anki</span>
              <span class="nlm-format-desc">记忆卡片</span>
            </div>
          </div>
          
          <button class="nlm-export-confirm-btn">导出文件</button>
        </div>
      </div>
    `;
    
    overlay.innerHTML = modalHtml;
    document.body.appendChild(overlay);
    
    // 事件处理
    const closeBtn = overlay.querySelector('.nlm-modal-close');
    closeBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    const options = overlay.querySelectorAll('.nlm-format-option');
    let selectedFormat = 'csv';
    options.forEach(opt => {
      opt.onclick = () => {
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedFormat = opt.dataset.format;
      };
    });
    
    const confirmBtn = overlay.querySelector('.nlm-export-confirm-btn');
    confirmBtn.onclick = () => {
      handleCardExport(type, selectedFormat, sourceTitle);
      overlay.remove();
    };
  }

  /**
   * 处理具体的卡片导出逻辑（基于本地缓存）
   */
  async function handleCardExport(type, format, title) {
    if (!latestProcessedCards || latestProcessedCards.length === 0) {
      NLM.DOM.showToast('尚未提取到数据，请稍候或刷新页面后再次进入。', window.innerWidth / 2, 100, false);
      return;
    }

    NLM.DOM.showToast(`准备导出 ${latestProcessedCards.length} 条数据...`, window.innerWidth / 2, 100, true);
    
    // 如果是 Anki 格式，对内容进行深度加工（公式转换 + 样式注入）
    const finalData = format === 'anki' ? latestProcessedCards.map(c => {
      const process = (txt) => (txt || '').replace(/\$([^\$]+)\$/g, '\\($1\\)');
      const newItem = {};
      
      // 1. 处理基础字段 (仅处理字符串类型，跳过 rawOptions 数组等)
      for (let key in c) { 
        if (typeof c[key] === 'string') {
          newItem[key] = process(c[key]); 
        } else {
          newItem[key] = c[key]; // 原样保留非字符串字段
        }
      }

      // 2. 如果是测验，生成带动态乱序、多选支持和交互式提示的 HTML
      if (type === 'quiz' && c.rawOptions) {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const isMulti = c.rawOptions.filter(o => o.isCorrect).length > 1;

        const commonScript = `
          function nlmShuffle(containerId) {
            var container = document.getElementById(containerId);
            if (!container) return;
            var isBack = containerId === 'quiz-results';
            var seed = isBack ? sessionStorage.getItem('nlm_seed') : Date.now();
            if (!isBack) sessionStorage.setItem('nlm_seed', seed);
            
            var n = parseInt(seed);
            function seededRandom() {
              var x = Math.sin(n++) * 10000;
              return x - Math.floor(x);
            }
            
            var items = Array.from(container.children);
            items.sort(function() { return seededRandom() - 0.5; });
            items.forEach(function(item, i) { 
              container.appendChild(item);
              var letterSpan = item.querySelector('.nlm-anki-letter');
              if (letterSpan) letterSpan.innerText = String.fromCharCode(65 + i) + '.';
            });
          }
        `;

        // 正面选项 HTML
        newItem.options = `<div class="nlm-anki-options" id="quiz-options">` + 
          c.rawOptions.map((opt, i) => `
            <div class="nlm-anki-opt-item" data-orig-index="${i}" onclick="selectNlmOption(${i}, ${isMulti})">
              <span class="nlm-anki-letter"></span>
              <span class="nlm-anki-text">${process(opt.text)}</span>
            </div>`).join('') + `</div>
            <script>
              ${commonScript}
              function selectNlmOption(idx, multi) {
                var current = JSON.parse(sessionStorage.getItem('nlm_choices') || '[]');
                if (multi) {
                  var pos = current.indexOf(idx);
                  if (pos > -1) current.splice(pos, 1);
                  else current.push(idx);
                } else {
                  current = [idx];
                }
                sessionStorage.setItem('nlm_choices', JSON.stringify(current));
                document.querySelectorAll('.nlm-anki-opt-item').forEach(el => {
                  var itemIdx = parseInt(el.getAttribute('data-orig-index'));
                  el.style.borderColor = current.includes(itemIdx) ? '#1a73e8' : '';
                  el.style.background = current.includes(itemIdx) ? '#e8f0fe' : '';
                });
              }
              nlmShuffle('quiz-options');
              sessionStorage.removeItem('nlm_choices');
            </script>`;

        // 背面选项 HTML
        newItem.rationale = `<div class="nlm-anki-results" id="quiz-results">` + 
          c.rawOptions.map((opt, i) => `
            <div class="nlm-anki-res-item ${opt.isCorrect ? 'is-correct' : ''}" data-orig-index="${i}">
              <div class="nlm-anki-res-header">
                <span class="nlm-anki-letter"></span>
                <span class="nlm-anki-text">${process(opt.text)}</span>
                ${opt.isCorrect ? '<span class="nlm-anki-badge">正确答案</span>' : ''}
                <span class="user-badge" style="display:none; margin-left:8px; font-size:12px; color:#d93025; font-weight:bold;">(你的选择)</span>
              </div>
              ${opt.rationale ? `<div class="nlm-anki-rationale">${process(opt.rationale)}</div>` : ''}
            </div>`).join('') + `</div>
            <script>
              ${commonScript}
              (function() {
                nlmShuffle('quiz-results');
                var choices = JSON.parse(sessionStorage.getItem('nlm_choices') || '[]');
                choices.forEach(function(choice) {
                  var item = document.querySelector('.nlm-anki-res-item[data-orig-index="' + choice + '"]');
                  if (item) {
                    if (!item.classList.contains('is-correct')) {
                      item.style.borderColor = '#d93025';
                      item.style.background = '#fce8e6';
                    }
                    var badge = item.querySelector('.user-badge');
                    if (badge) badge.style.display = 'inline';
                  }
                });
              })();
            </script>`;
      }

      // 3. 处理极简交互式提示 (Hint)
      if (newItem.hint) {
        const hText = newItem.hint;
        newItem.hint = `
          <div class="nlm-anki-hint-wrap" style="margin-top:10px; font-size:14px;">
            <span style="color:#1a73e8; cursor:pointer; font-weight:500;" onclick="this.style.display='none'; this.nextElementSibling.style.display='inline';">💡 提示</span>
            <span style="display:none; color:#5f6368;">💡 提示：${hText}</span>
          </div>`;
      }
      
      return newItem;
    }) : latestProcessedCards;

    generateAndDownloadCards(finalData, format, title, type);
  }


  /**
   * 根据格式生成并下载文件
   */
  function generateAndDownloadCards(data, format, title, type) {
    const date = new Date().toISOString().slice(0, 10);
    const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    let content = '';
    let extension = '';
    let mimeType = 'text/plain;charset=utf-8';

    if (format === 'csv' || format === 'anki') {
      const separator = format === 'anki' ? '\t' : ',';
      extension = format === 'anki' ? 'txt' : 'csv';
      
      // 生成头部（Anki 不需要头部，通用 CSV 需要）
      const rows = [];
      if (format === 'csv') {
        if (type === 'flashcard') rows.push(['正面', '背面'].join(separator));
        else rows.push(['问题', '选项', '正确答案', '提示', '解析'].join(separator));
      }

      data.forEach(item => {
        if (type === 'flashcard') {
          rows.push([`"${(item.front || '').replace(/"/g, '""')}"`, `"${(item.back || '').replace(/"/g, '""')}"`].join(separator));
        } else {
          rows.push([
            `"${(item.question || '').replace(/"/g, '""')}"`, 
            `"${(item.options || '').replace(/"/g, '""')}"`, 
            `"${(item.answer || '').replace(/"/g, '""')}"`,
            `"${(item.hint || '').replace(/"/g, '""')}"`,
            `"${(item.rationale || '').replace(/"/g, '""')}"`
          ].join(separator));
        }
      });
      
      content = (format === 'csv' ? '\ufeff' : '') + rows.join('\n'); // CSV 增加 BOM
      mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8';
    } 
    else if (format === 'md') {
      extension = 'md';
      const lines = [`# ${title}`, `> 导出日期: ${date}`, ''];
      data.forEach((item, index) => {
        lines.push(`## ${type === 'flashcard' ? '卡片' : '题目'} ${index + 1}`);
        if (type === 'flashcard') {
          lines.push(`**正面**: ${item.front}`);
          lines.push('');
          lines.push(`**背面**: ${item.back}`);
        } else {
          lines.push(`**问题**: ${item.question}`);
          if (item.options) lines.push(`**选项**: ${item.options}`);
          lines.push(`**正确答案**: ${item.answer}`);
          if (item.hint) lines.push(`**提示**: ${item.hint}`);
          if (item.rationale) lines.push(`**解析**: ${item.rationale}`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
      });
      content = lines.join('\n');
      mimeType = 'text/markdown;charset=utf-8';
    }

    downloadBlob(content, `${safeTitle}_${date}.${extension}`, mimeType);
  }

  /**
   * 创建统一的 Studio 导出按钮
   * @param {string} label - 按钮文字（如「导出笔记」「导出报告」）
   * @param {Function} onClick - 点击回调
   */
  function createExportBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'mdc-button mat-mdc-button-base button-small mdc-button--outlined mat-mdc-outlined-button mat-unthemed _mat-animation-noopable nlm-studio-export-btn';
    btn.style.marginLeft = '8px';
    btn.innerHTML = `
      <span class="mat-mdc-button-persistent-ripple mdc-button__ripple"></span>
      <mat-icon role="img" class="mat-icon notranslate material-symbols-outlined mat-icon-rtl-mirror google-symbols mat-icon-no-color" data-mat-icon-type="font">file_download</mat-icon>
      <span class="mdc-button__label" style="margin-left: 4px;">${label}</span>
      <span class="mat-focus-indicator"></span>
      <span class="mat-mdc-button-touch-target"></span>
    `;
    btn.onclick = onClick;
    return btn;
  }

  function downloadNoteMarkdown(doc, defaultTitle) {
    const currentTitle = doc.getElementById('editableTitle').innerText.trim() || defaultTitle;
    const contentEl = doc.querySelector('.content').cloneNode(true);
    const mdText = htmlToMarkdown(contentEl);
    
    const lines = [];
    lines.push('# ' + currentTitle);
    lines.push('');
    lines.push(mdText);
    
    const finalMd = lines.join('\n');
    const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8' });
    const a = doc.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    const date = new Date().toISOString().slice(0, 10);
    const safeFilename = currentTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 50);
    a.download = `${safeFilename}_${date}.md`; 
    a.click();
  }

  function downloadNoteWord(doc, defaultTitle) {
    const currentTitle = doc.getElementById('editableTitle').innerText.trim() || defaultTitle;
    const containerClone = doc.getElementById('messages-container').cloneNode(true);
    containerClone.querySelectorAll('.delete-btn, .nlm-delete-mask, .nlm-delete-label').forEach(el => el.remove());
    
    const contentHtml = containerClone.innerHTML;
    const metaText = doc.querySelector('.meta') ? doc.querySelector('.meta').innerText : '';
    
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${currentTitle}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.5; color: #1f1f1f; }
          h1 { text-align: center; color: #1a73e8; font-size: 22pt; margin-bottom: 5pt; }
          .meta { text-align: center; color: #70757a; font-size: 10pt; margin-bottom: 30pt; }
          .content { font-size: 11pt; }
          pre { background-color: #f1f3f4; padding: 8pt; border-radius: 4pt; font-family: 'Consolas', 'Courier New', monospace; font-size: 10pt; }
          code { background-color: #f1f3f4; font-family: 'Consolas', 'Courier New', monospace; }
          ul, ol { margin-left: 20pt; }
        </style>
      </head>
      <body>
        <h1>${currentTitle}</h1>
        <div class="meta">${metaText}</div>
        <div id="messages-container">${contentHtml}</div>
      </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const safeFilename = currentTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 50);
    a.download = `${safeFilename}_${date}.doc`;
    a.click();
  }

  /**
   * 统一的 Artifact 导出预览入口
   * 自动检测内容类型（笔记 / 报告），复用同一套预览窗口和下载管线
   */
  function openArtifactExportPreview(container) {
    let contentContainer = null;
    let noteTitle = '';
    
    // 优先级 1：笔记模式
    contentContainer = container.querySelector('.note-editor');
    if (contentContainer) {
      const titleEl = container.querySelector('.note-header__editable-title');
      noteTitle = titleEl ? titleEl.value.trim() : '';
    }
    
    // 优先级 2：报告模式
    if (!contentContainer) {
      contentContainer = container.querySelector('report-viewer labs-tailwind-doc-viewer');
      if (!contentContainer) {
        contentContainer = container.querySelector('report-viewer');
      }
      if (contentContainer) {
        const titleInput = container.querySelector('input.artifact-title');
        noteTitle = titleInput ? titleInput.value.trim() : '';
      }
    }
    
    if (!contentContainer) {
      NLM.DOM.showToast('未找到可导出的内容', window.innerWidth / 2, 100, false);
      return;
    }
    
    noteTitle = noteTitle || NLM.i18n.get('exportDefaultTitle') || '导出文档';
    const cleanHtml = extractCleanHtml(contentContainer);
    
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${NLM.i18n.get('exportPreviewTitle', [document.title])}</title>
          <link rel="stylesheet" href="${chrome.runtime.getURL('lib/katex.min.css')}">
          <style>
            body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 0; color: #1f1f1f; }
            .toolbar { position: sticky; top: 0; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); padding: 12px 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
            .toolbar-title { font-size: 16px; font-weight: 600; color: #1a73e8; }
            .btn-group { display: flex; gap: 12px; }
            button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
            .btn-md { background: #fff; border: 1px solid #dadce0; color: #3c4043; }
            .btn-md:hover { background: #f8f9fa; border-color: #bdc1c6; }
            .btn-word { background: #e8f0fe; border: 1px solid #1a73e8; color: #1a73e8; }
            .btn-word:hover { background: #d2e3fc; }
            .btn-pdf { background: #1a73e8; color: white; }
            .btn-pdf:hover { background: #1765cc; }
            .preview-container { max-width: 850px; margin: 30px auto; background: #fff; padding: 50px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; position: relative; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 8px; font-weight: 700; border-radius: 4px; padding: 4px; transition: background 0.2s; outline: none; }
            h1[contenteditable="true"]:hover { background: #f1f3f4; cursor: text; }
            h1[contenteditable="true"]:focus { background: #fff; box-shadow: 0 0 0 2px #1a73e8; }
            .meta { text-align: center; color: #70757a; font-size: 13px; margin-bottom: 50px; }
            .content { font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
            pre { background: #f1f3f4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; }
            
            .nlm-delete-mask {
              position: absolute; display: none; background: rgba(234, 67, 53, 0.15);
              border: 1px solid #ea4335; pointer-events: none; z-index: 10000;
              align-items: center; justify-content: center;
              border-radius: 2px; box-sizing: border-box;
            }
            .nlm-delete-label {
              position: fixed; background: rgba(31, 31, 31, 0.9); color: white; padding: 6px 12px;
              border-radius: 4px; font-size: 11px; font-weight: 500; display: none;
              align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              pointer-events: none; white-space: nowrap; z-index: 10001;
              transform: translate(15px, 15px);
            }
            .nlm-delete-label svg { width: 14px; height: 14px; stroke: white; }
            .btn-mode-toggle { background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; }
            .btn-mode-toggle.active { background: #fce8e6; color: #d93025; border-color: #f19f97; }
            .nlm-delete-target-hover {
              cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>') 12 12, crosshair !important;
            }
            
            @media print {
              .toolbar, .nlm-delete-mask { display: none !important; }
              .preview-container { box-shadow: none; margin: 0; padding: 20px; width: 100%; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="toolbar-title">${NLM.i18n.get('exportToolbarTitle') || '笔记导出'}</div>
            <div class="btn-group">
              <button id="toggleDeleteMode" class="btn-mode-toggle active" title="开启后可通过红色遮罩精准删除内容">✂️ 精准删除模式</button>
              <button class="btn-md" id="downloadMdBtn">${NLM.i18n.get('btnDownloadMd')}</button>
              <button class="btn-word" id="downloadWordBtn">${NLM.i18n.get('btnSaveWord')}</button>
              <button class="btn-pdf" id="downloadPdfBtn">${NLM.i18n.get('btnSavePdf')}</button>
            </div>
          </div>
          <div class="preview-container">
            <h1 id="editableTitle" contenteditable="true" title="${NLM.i18n.get('clickToEdit', ['点击修改标题'])}">${noteTitle}</h1>
            <div class="meta">${NLM.i18n.get('exportTime', [new Date().toLocaleString()])}</div>
            <div id="messages-container">
              <div class="content">${cleanHtml}</div>
            </div>
          </div>
        </body>
      </html>
    `;
    
    const win = window.open("", "_blank");
    if (!win) {
      NLM.DOM.showToast(NLM.i18n.get('toastPopupBlocked'), window.innerWidth / 2, 100, false);
      return;
    }
    
    win.document.write(html);
    win.document.close();
    const doc = win.document;

    const pdfBtn = doc.getElementById('downloadPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => win.print());

    const wordBtn = doc.getElementById('downloadWordBtn');
    if (wordBtn) wordBtn.addEventListener('click', () => downloadNoteWord(doc, noteTitle));

    const mdBtn = doc.getElementById('downloadMdBtn');
    if (mdBtn) mdBtn.addEventListener('click', () => downloadNoteMarkdown(doc, noteTitle));

    // 精准删除模式
    const mask = doc.createElement('div');
    mask.className = 'nlm-delete-mask';
    doc.body.appendChild(mask);

    const label = doc.createElement('div');
    label.className = 'nlm-delete-label';
    label.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>${NLM.i18n.get('btnDeleteMessage') || 'Click to delete'}`;
    doc.body.appendChild(label);

    let isDeleteMode = true; 
    let currentTarget = null;

    const toggleBtn = doc.getElementById('toggleDeleteMode');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        isDeleteMode = !isDeleteMode;
        toggleBtn.classList.toggle('active', isDeleteMode);
        doc.body.style.cursor = isDeleteMode ? 'crosshair' : 'default';
        if (!isDeleteMode) {
          mask.style.display = 'none';
          label.style.display = 'none';
        }
      });
      doc.body.style.cursor = 'crosshair';
    }

    doc.addEventListener('mouseover', (e) => {
      if (!isDeleteMode) return;
      const target = e.target;
      const isInside = target.closest('#messages-container') || target.closest('.preview-container h1') || target.closest('.preview-container .meta');
      
      if (isInside && target.id !== 'messages-container' && !target.classList.contains('content')) {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        currentTarget = target;
        currentTarget.classList.add('nlm-delete-target-hover');
        
        const rect = target.getBoundingClientRect();
        mask.style.display = 'block';
        mask.style.top = (rect.top + win.scrollY) + 'px';
        mask.style.left = (rect.left + win.scrollX) + 'px';
        mask.style.width = rect.width + 'px';
        mask.style.height = rect.height + 'px';
        label.style.display = 'flex';
      } else {
        if (currentTarget) currentTarget.classList.remove('nlm-delete-target-hover');
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    });

    doc.addEventListener('mousemove', (e) => {
      if (isDeleteMode && currentTarget) {
        label.style.left = e.clientX + 'px';
        label.style.top = e.clientY + 'px';
      }
    });

    doc.addEventListener('click', (e) => {
      if (isDeleteMode && currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        currentTarget.remove();
        mask.style.display = 'none';
        label.style.display = 'none';
        currentTarget = null;
      }
    }, true);

    doc.addEventListener('copy', (event) => {
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const fragment = sel.getRangeAt(0).cloneContents();
      if (!fragment.querySelector('.katex, [data-nlm-latex]')) return;
      
      event.preventDefault();
      const div = doc.createElement('div');
      div.appendChild(fragment);

      div.querySelectorAll('[data-nlm-latex]').forEach(el => {
        const latex = el.getAttribute('data-nlm-latex');
        if (latex) {
          const isBlock = el.closest('.katex-display') !== null || el.classList.contains('katex-display');
          el.replaceWith(doc.createTextNode(isBlock ? "\\n\\\\[ " + latex + " \\\\]\\n" : "$" + latex + "$"));
        } else {
          el.remove();
        }
      });
      
      let text = (div.innerText || div.textContent || '').replace(/[\\u00B0\\u2022\\u2219\\u25CF]/g, '').trim();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', div.innerHTML);
    });
  }

  return { init, destroy, htmlToMarkdown, extractCleanHtml, openStashPreview };
})();
