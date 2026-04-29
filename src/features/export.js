/**
 * NLM Enhancer 对话导出模块
 * 将当前对话导出为 Markdown 文件，并提供纯净的 LaTeX 预览复制
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.Export = (() => {
  const LOG = '[NLM Enhancer Export]';

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
      "check", "landscape_2", "photo_spark", "keep", "more_vert"
    ];
    
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

  function openExportPreview() {
    const messages = NLM.DOM.findAllMessages();
    if (messages.length === 0) {
      NLM.DOM.showToast(NLM.i18n.get('toastNoConversation'), window.innerWidth / 2, 100, false);
      return;
    }
    
    const safeTitle = (document.title || "notebooklm").replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_${date}.md`;
    
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
            .btn-pdf { background: #1a73e8; color: white; }
            .btn-pdf:hover { background: #1765cc; }
            
            .preview-container { max-width: 850px; margin: 30px auto; background: #fff; padding: 50px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 8px; font-weight: 700; }
            .meta { text-align: center; color: #70757a; font-size: 13px; margin-bottom: 50px; }
            
            .msg-pair { position: relative; margin-bottom: 20px; border-radius: 12px; transition: background 0.2s; }
            .msg-pair:hover { background: #fdfdfd; }
            .msg-pair:hover .delete-btn { opacity: 1; }
            
            .delete-btn { position: absolute; left: -45px; top: 10px; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 1px solid #dadce0; color: #d93025; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 0 !important; border: 1px solid #eee; }
            .delete-btn:hover { background: #fce8e6; border-color: #f19f97; transform: scale(1.1); }
            .delete-btn svg { pointer-events: none; width: 18px; height: 18px; }
            
            .msg { padding: 12px 20px; border-radius: 8px; margin-bottom: 10px; }
            .user { background: #f8f9fa; border-left: 4px solid #1a73e8; }
            .model { background: #fff; border-bottom: 1px solid #f1f3f4; }
            .role { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: #5f6368; text-transform: uppercase; }
            .content { font-size: 15px; line-height: 1.7; }
            
            pre { background: #f1f3f4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; position: relative; }
            
            @media print {
              .toolbar, .delete-btn { display: none !important; }
              .preview-container { box-shadow: none; margin: 0; padding: 20px; width: 100%; max-width: none; }
              .msg-pair { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="toolbar-title">${NLM.i18n.get('exportToolbarTitle')}</div>
            <div class="btn-group">
              <button class="btn-md" id="downloadMdBtn">${NLM.i18n.get('btnDownloadMd')}</button>
              <button class="btn-pdf" id="downloadPdfBtn">${NLM.i18n.get('btnSavePdf')}</button>
            </div>
          </div>
          <div class="preview-container">
            <h1>${NLM.i18n.get('exportPreview')}</h1>
            <div class="meta">${NLM.i18n.get('exportTime', [new Date().toLocaleString()])}</div>
            <div id="messages-container">
    `;
    
    messages.forEach((msg, idx) => {
      const roleName = msg.type === "user" ? NLM.i18n.get('roleUser') : NLM.i18n.get('roleModel');
      const roleClass = msg.type === "user" ? "user" : "model";
      const cleanHtml = extractCleanHtml(msg.element);
      html += `
        <div class="msg-pair" data-idx="${idx}">
          <button class="delete-btn" title="${NLM.i18n.get('btnDeleteMessage')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
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

    doc.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-btn');
      if (btn) {
        const pair = btn.closest('.msg-pair');
        if (pair) pair.remove();
      }
    });

    const mdBtn = doc.getElementById('downloadMdBtn');
    if (mdBtn) {
      mdBtn.addEventListener('click', () => {
        const lines = [];
        const titleEl = doc.querySelector('h1');
        const metaEl = doc.querySelector('.meta');
        lines.push('# ' + (titleEl ? titleEl.innerText : NLM.i18n.get('exportDefaultTitle')));
        lines.push('> ' + (metaEl ? metaEl.innerText : ''));
        lines.push('');
        lines.push('---');
        lines.push('');
        
        doc.querySelectorAll('.msg-pair').forEach(pair => {
          const isUser = pair.querySelector('.user') !== null;
          const role = isUser ? NLM.i18n.get('mdRoleUser') : NLM.i18n.get('mdRoleModel');
          const contentEl = pair.querySelector('.content').cloneNode(true);
          
          // 调用最新修复的解析引擎
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
        a.download = filename; 
        a.click();
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
    isInitialized = true;
  }

  function destroy() {
    if (exportBtn) exportBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    isInitialized = false;
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
            .btn-pdf { background: #1a73e8; color: white; }
            .btn-pdf:hover { background: #1765cc; }
            .preview-container { max-width: 850px; margin: 30px auto; background: #fff; padding: 50px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 8px; font-weight: 700; border-radius: 4px; padding: 4px; transition: background 0.2s; outline: none; }
            h1[contenteditable="true"]:hover { background: #f1f3f4; cursor: text; }
            h1[contenteditable="true"]:focus { background: #fff; box-shadow: 0 0 0 2px #1a73e8; }
            .meta { text-align: center; color: #70757a; font-size: 13px; margin-bottom: 50px; }
            .msg-pair { position: relative; margin-bottom: 20px; border-radius: 12px; transition: background 0.2s; }
            .msg-pair:hover { background: #fdfdfd; }
            .msg-pair:hover .delete-btn { opacity: 1; }
            .delete-btn { position: absolute; left: -45px; top: 10px; width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 1px solid #eee; color: #d93025; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 0 !important; }
            .delete-btn:hover { background: #fce8e6; border-color: #f19f97; transform: scale(1.1); }
            .delete-btn svg { pointer-events: none; width: 18px; height: 18px; }
            .msg { padding: 12px 20px; border-radius: 8px; margin-bottom: 10px; }
            .user { background: #f8f9fa; border-left: 4px solid #1a73e8; }
            .model { background: #fff; border-bottom: 1px solid #f1f3f4; }
            .role { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: #5f6368; text-transform: uppercase; }
            .content { font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
            pre { background: #f1f3f4; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; }
            .stash-divider { border: none; border-top: 2px dashed #dadce0; margin: 30px 0; }
            @media print {
              .toolbar, .delete-btn { display: none !important; }
              .preview-container { box-shadow: none; margin: 0; padding: 20px; width: 100%; max-width: none; }
              .msg-pair { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div class="toolbar-title">${NLM.i18n.get('cartPanelTitle')}</div>
            <div class="btn-group">
              <button class="btn-md" id="downloadMdBtn">${NLM.i18n.get('btnDownloadMd')}</button>
              <button class="btn-pdf" id="downloadPdfBtn">${NLM.i18n.get('btnSavePdf')}</button>
            </div>
          </div>
          <div class="preview-container">
            <h1 id="editableTitle" contenteditable="true" title="${NLM.i18n.get('clickToEdit', ['点击修改标题'])}">${defaultTitle}</h1>
            <div class="meta">${NLM.i18n.get('exportTime', [new Date().toLocaleString()])} · ${NLM.i18n.get('stashItemCount', [String(stashItems.length)])}</div>
            <div id="messages-container">
    `;

    stashItems.forEach((item, idx) => {
      // 每个暂存块可能包含 user + model
      if (item.userHtml || item.userMarkdown) {
        const contentToShow = item.userHtml ? item.userHtml : escapeHtmlForPreview(item.userMarkdown);
        html += `
          <div class="msg-pair" data-idx="${idx}-user">
            <button class="delete-btn" title="${NLM.i18n.get('btnDeleteMessage')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
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
            <button class="delete-btn" title="${NLM.i18n.get('btnDeleteMessage')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
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

    // 删除
    doc.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-btn');
      if (btn) { const pair = btn.closest('.msg-pair'); if (pair) pair.remove(); }
    });

    // Markdown 下载
    const mdBtn = doc.getElementById('downloadMdBtn');
    if (mdBtn) {
      mdBtn.addEventListener('click', () => {
        const currentTitle = doc.getElementById('editableTitle').innerText.trim() || defaultTitle;
        const lines = [];
        lines.push(`# ${currentTitle}`);
        lines.push(`> ${NLM.i18n.get('exportTime', [new Date().toLocaleString()])}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        const remainingPairs = Array.from(doc.querySelectorAll('.msg-pair')).map(el => el.dataset.idx);

        stashItems.forEach((item, idx) => {
          if (remainingPairs.includes(`${idx}-user`) && item.userMarkdown) {
            lines.push(`## ${NLM.i18n.get('mdRoleUser')}\n\n${item.userMarkdown}\n\n---\n`);
          }
          if (remainingPairs.includes(`${idx}-model`) && item.modelMarkdown) {
            lines.push(`## ${NLM.i18n.get('mdRoleModel')}\n\n${item.modelMarkdown}\n\n---\n`);
          }
        });

        const finalMd = lines.join('\n');
        const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8' });
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
      });
    }
  }

  /**
   * 简易 HTML 转义（用于预览窗口中展示 Markdown 文本）
   */
  function escapeHtmlForPreview(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { init, destroy, htmlToMarkdown, extractCleanHtml, openStashPreview };
})();
