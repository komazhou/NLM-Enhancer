/**
 * NotebookLM++ 对话导出模块
 * 将当前对话导出为 Markdown 文件，并提供纯净的 LaTeX 预览复制
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.Export = (() => {
  const LOG = "[NLM++ Export]";

  function cleanExtractedText(text) {
    return text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

    // 【核心联动】：利用强大的 FormulaCopy 引擎，为所有公式烙上无损的 LaTeX 源码印记
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
      NLM.DOM.showToast("未找到对话内容", window.innerWidth / 2, 100, false);
      return;
    }
    
    const safeTitle = (document.title || "notebooklm").replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 50);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_${date}.md`;
    
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>导出预览 - ${document.title}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
            <div class="toolbar-title">对话导出预览</div>
            <div class="btn-group">
              <button class="btn-md" id="downloadMdBtn">下载 Markdown</button>
              <button class="btn-pdf" id="downloadPdfBtn">另存为 PDF</button>
            </div>
          </div>
          <div class="preview-container">
            <h1>预览</h1>
            <div class="meta">导出时间: ${new Date().toLocaleString("zh-CN")}</div>
            <div id="messages-container">
    `;
    
    messages.forEach((msg, idx) => {
      const roleName = msg.type === "user" ? "用户" : "NotebookLM";
      const roleClass = msg.type === "user" ? "user" : "model";
      const cleanHtml = extractCleanHtml(msg.element);
      html += `
        <div class="msg-pair" data-idx="${idx}">
          <button class="delete-btn" title="删除此条消息">
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
      NLM.DOM.showToast("预览窗口被拦截，请允许弹出窗口", window.innerWidth / 2, 100, false);
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
        lines.push('# ' + (titleEl ? titleEl.innerText : '导出的对话'));
        lines.push('> ' + (metaEl ? metaEl.innerText : ''));
        lines.push('');
        lines.push('---');
        lines.push('');
        
        doc.querySelectorAll('.msg-pair').forEach(pair => {
          const isUser = pair.querySelector('.user') !== null;
          const role = isUser ? '👤 **用户**' : '🤖 **NotebookLM**';
          const contentEl = pair.querySelector('.content').cloneNode(true);
          
          // 利用 data-nlm-latex 属性还原 Markdown，放弃不稳定的 annotation 提取
          contentEl.querySelectorAll('[data-nlm-latex]').forEach(el => {
            const latex = el.getAttribute('data-nlm-latex');
            const isBlock = el.closest('.katex-display') !== null || el.classList.contains('katex-display');
            el.replaceWith(doc.createTextNode(isBlock ? '\n\\[ ' + latex + ' \\]\n' : '$' + latex + '$'));
          });
          
          lines.push('## ' + role);
          lines.push('');
          lines.push(contentEl.innerText.trim());
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

    // 【预览页专属防干扰复制】：直接读取预存的 LaTeX 烙印，无惧 DOM 缺失
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
          el.replaceWith(doc.createTextNode(isBlock ? "\n\\[" + latex + "\\]\n" : "$" + latex + "$"));
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
      <span>导出</span>
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

  return { init, destroy };
})();
