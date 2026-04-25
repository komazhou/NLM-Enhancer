/**
 * NotebookLM++ 对话导出模块
 * 将当前对话导出为 Markdown 文件
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

    if (NLM.FormulaCopy && NLM.FormulaCopy.replaceFormulasWithLatex) {
      NLM.FormulaCopy.replaceFormulasWithLatex(clone);
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
          <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
          <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
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
            
            /* Mermaid 切换按钮 */
            .mermaid-container { margin: 15px 0; background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 20px; display: flex; justify-content: center; overflow-x: auto; }
            .mermaid-toggle { position: absolute; right: 10px; top: 10px; padding: 4px 8px; font-size: 11px; background: rgba(26,115,232,0.1); color: #1a73e8; border: 1px solid rgba(26,115,232,0.2); border-radius: 4px; z-index: 5; }
            .mermaid-toggle:hover { background: rgba(26,115,232,0.2); }
            .hidden { display: none !important; }

            @media print {
              .toolbar, .delete-btn, .mermaid-toggle { display: none !important; }
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
          <script>
            // KaTeX 渲染
            function startRender() {
              if (window.renderMathInElement) {
                renderMathInElement(document.body, {
                  delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\\\[", right: "\\\\]", display: true},
                    {left: "\\\\(", right: "\\\\)", display: false}
                  ],
                  ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
                  throwOnError: false
                });
                console.log("KaTeX 渲染完成");
              } else {
                setTimeout(startRender, 200);
              }
            }

            // Mermaid 渲染与切换逻辑
            async function startMermaid() {
              if (!window.mermaid) {
                setTimeout(startMermaid, 200);
                return;
              }
              
              mermaid.initialize({ startOnLoad: false, theme: 'default' });
              const codes = document.querySelectorAll('pre');
              
              for (const pre of codes) {
                const codeText = pre.innerText.trim();
                if (codeText.startsWith('graph ') || codeText.startsWith('sequenceDiagram') || 
                    codeText.startsWith('gantt') || codeText.startsWith('classDiagram') ||
                    codeText.startsWith('stateDiagram') || codeText.startsWith('pie') ||
                    codeText.startsWith('flowchart') || codeText.startsWith('erDiagram')) {
                  
                  // 创建切换按钮
                  const toggleBtn = document.createElement('button');
                  toggleBtn.className = 'mermaid-toggle';
                  toggleBtn.innerText = '显示图表';
                  pre.appendChild(toggleBtn);
                  
                  // 创建图表容器
                  const container = document.createElement('div');
                  container.className = 'mermaid-container hidden';
                  const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                  container.id = id;
                  pre.after(container);
                  
                  toggleBtn.onclick = async () => {
                    if (container.classList.contains('hidden')) {
                      if (!container.getAttribute('data-rendered')) {
                        try {
                          const { svg } = await mermaid.render(id + '-svg', codeText);
                          container.innerHTML = svg;
                          container.setAttribute('data-rendered', 'true');
                        } catch (e) {
                          container.innerText = 'Mermaid 渲染失败: ' + e.message;
                        }
                      }
                      container.classList.remove('hidden');
                      pre.classList.add('hidden'); // 隐藏代码
                      toggleBtn.innerText = '显示代码';
                      // 将按钮移出 pre 以便在隐藏 pre 后仍可见
                      container.style.position = 'relative';
                      container.appendChild(toggleBtn);
                    } else {
                      container.classList.add('hidden');
                      pre.classList.remove('hidden');
                      toggleBtn.innerText = '显示图表';
                      pre.appendChild(toggleBtn);
                    }
                  };
                }
              }
            }

            document.addEventListener('DOMContentLoaded', () => {
              startRender();
              startMermaid();
            });
            window.onload = () => {
              startRender();
              startMermaid();
            };
            setTimeout(() => { startRender(); startMermaid(); }, 1500);

            // 公式提取逻辑 (注入到预览页)
            function extractVisibleMathText(katexHtmlEl) {
              const parts = [];
              function walk(node) {
                if (!node) return;
                if (node.nodeType === 3) {
                  let text = node.textContent;
                  if (text && text.trim()) {
                    const symbolMap = { '\u2212': '-', '\u22c5': '\\cdot ', '\u2217': '*', '\u00d7': '\\times ', '\u00f7': '\\div ', '\u00b1': '\\pm ', '\u2264': '\\leq ', '\u2265': '\\geq ', '\u2260': '\\neq ', '\u2248': '\\approx ', '\u221e': '\\infty ', '\u2202': '\\partial ', '\u2206': '\\Delta ' };
                    let p = ''; for (let c of text) p += symbolMap[c] || c;
                    parts.push(p);
                  }
                  return;
                }
                if (node.nodeType !== 1) return;
                const cls = node.className || '';
                if (cls.includes('hide-tail') || node.style.display === 'none' || cls.includes('strut') || cls.includes('vlist-s')) return;
                if (cls.includes('mfrac')) {
                  const rows = Array.from(node.querySelectorAll('.vlist > span[style*="top"]')).sort((a,b)=>parseFloat(a.style.top)-parseFloat(b.style.top));
                  if (rows.length >= 2) { parts.push('\\\\frac{'); walk(rows[0]); parts.push('}{'); walk(rows[rows.length-1]); parts.push('}'); return; }
                }
                if (cls.includes('msupsub')) {
                  const rows = Array.from(node.querySelectorAll('.vlist > span[style*="top"]')).sort((a,b)=>parseFloat(a.style.top)-parseFloat(b.style.top));
                  rows.forEach(r => { const t = parseFloat(r.style.top||0); if (t < -3.1) { parts.push('^{'); walk(r); parts.push('}'); } else { parts.push('_{'); walk(r); parts.push('}'); } });
                  return;
                }
                if (cls.includes('msqrt')) { const b = node.querySelector('.mord'); if (b) { parts.push('\\\\sqrt{'); walk(b); parts.push('}'); return; } }
                if (cls.includes('mopen') || cls.includes('mclose')) { parts.push(node.textContent.trim()); return; }
                for (let c of node.childNodes) walk(c);
              }
              walk(katexHtmlEl);
              return parts.join('').replace(/\\s+/g, ' ').trim();
            }

            function extractLatex(el) {
              const ann = el.querySelector('annotation');
              if (ann?.textContent?.trim()) return ann.textContent.trim();
              const kHtml = el.querySelector('.katex-html');
              if (kHtml) return extractVisibleMathText(kHtml);
              return null;
            }

            // 在预览界面拦截复制事件，处理公式
            document.addEventListener('copy', (event) => {
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
              const fragment = sel.getRangeAt(0).cloneContents();
              if (!fragment.querySelector('.katex')) return;
              
              event.preventDefault();
              const div = document.createElement('div');
              div.appendChild(fragment);
              
              div.querySelectorAll('.katex').forEach(el => {
                const latex = extractLatex(el);
                if (latex) {
                  const isBlock = el.closest('.katex-display') !== null || el.classList.contains('katex-display');
                  el.replaceWith(document.createTextNode(isBlock ? "\\n\\\\[" + latex + "\\\\]\\n" : "$" + latex + "$"));
                } else {
                  el.remove();
                }
              });
              
              let text = (div.innerText || div.textContent || '').replace(/[\\u00B0\\u2022\\u2219\\u25CF]/g, '').trim();
              event.clipboardData.setData('text/plain', text);
              event.clipboardData.setData('text/html', div.innerHTML);
            });
          </script>
        </body>
      </html>
    `;
    
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      const doc = win.document;
      doc.getElementById("downloadPdfBtn").addEventListener("click", () => win.print());
      doc.getElementById("downloadMdBtn").addEventListener("click", () => {
        const lines = [];
        lines.push("# " + doc.querySelector("h1").innerText);
        lines.push("> " + doc.querySelector(".meta").innerText);
        lines.push("\n---\n");
        doc.querySelectorAll(".msg-pair").forEach(pair => {
          const role = pair.querySelector(".user") ? "👤 **用户**" : "🤖 **NotebookLM**";
          const contentEl = pair.querySelector(".content").cloneNode(true);
          contentEl.querySelectorAll(".katex-mathml annotation").forEach(ann => {
            const latex = ann.textContent.trim();
            const isBlock = ann.closest(".katex-display") !== null;
            ann.closest(".katex").replaceWith(doc.createTextNode(isBlock ? "\\[" + latex + "\\]" : "$" + latex + "$"));
          });
          lines.push("## " + role + "\n");
          lines.push(contentEl.innerText.trim() + "\n");
          lines.push("---\n");
        });
        const finalMd = lines.join("\n");
        const blob = new Blob([finalMd], { type: "text/markdown;charset=utf-8" });
        const a = doc.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      });
      doc.addEventListener("click", (e) => {
        const btn = e.target.closest(".delete-btn");
        if (btn) btn.closest(".msg-pair").remove();
      });
    }
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
          // 右侧按钮对齐输入框容器右边缘
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
