/**
 * NotebookLM++ Mermaid 图表渲染模块
 * 拦截 Mermaid 代码块并渲染为可视化 SVG 图表
 * Mermaid 库按需动态加载以减小初始包体积
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.MermaidRender = (() => {
  const LOG = '[NLM++ Mermaid]';
  let mermaidInstance = null;
  let mermaidLoadFailed = false;
  let observer = null;
  let isInitialized = false;

  // Mermaid 图表类型关键字
  const MERMAID_KEYWORDS = [
    'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitGraph',
    'journey', 'mindmap', 'timeline', 'zenuml', 'quadrantChart',
    'sankey', 'xychart', 'block', 'kanban', 'C4Context',
    'C4Container', 'C4Component', 'requirementDiagram',
  ];

  /**
   * 将字符串转换为 Base64Url 编码
   */
  function toBase64Url(str) {
    const utf8Bytes = new TextEncoder().encode(str);
    let binaryString = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binaryString += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * 判断代码是否为 Mermaid 语法
   */
  function isMermaidCode(code) {
    const trimmed = code.trim();
    if (trimmed.length < 10) return false;
    const startsWithKeyword = trimmed.startsWith('%%') ||
      MERMAID_KEYWORDS.some((kw) => trimmed.toLowerCase().startsWith(kw.toLowerCase()));
    if (!startsWithKeyword) return false;

    const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) return false;

    return true;
  }

  /**
   * 渲染单个代码块
   */
  function renderBlock(codeEl, code) {
    const normalizedCode = code.replace(/[\u00A0\u2002\u2003\u2009\u3000]/g, ' ')
                                .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    if (codeEl.dataset.mermaidCode === normalizedCode) return;
    if (codeEl.dataset.mermaidProcessing === 'true') return;
    codeEl.dataset.mermaidProcessing = 'true';

    try {
      // 创建包装器
      const parent = codeEl.closest('pre') || codeEl.parentElement;
      if (!parent) { codeEl.dataset.mermaidProcessing = 'false'; return; }

      let wrapper = parent.parentElement;
      if (!wrapper?.classList.contains('nlm-mermaid-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'nlm-mermaid-wrapper';
        parent.parentElement?.insertBefore(wrapper, parent);
        wrapper.appendChild(parent);

        // 切换按钮
        const toggle = document.createElement('div');
        toggle.className = 'nlm-mermaid-toggle';

        const diagramBtn = document.createElement('button');
        diagramBtn.textContent = '📊 图表';
        diagramBtn.className = 'active';

        const codeBtn = document.createElement('button');
        codeBtn.textContent = '</> 代码';

        toggle.appendChild(diagramBtn);
        toggle.appendChild(codeBtn);
        wrapper.appendChild(toggle);

        // 图表容器
        const diagramContainer = document.createElement('div');
        diagramContainer.className = 'nlm-mermaid-diagram';
        diagramContainer.style.background = '#fff'; // Mermaid svg usually looks better on white
        diagramContainer.style.padding = '10px';
        diagramContainer.style.borderRadius = '8px';
        diagramContainer.style.textAlign = 'center';
        wrapper.appendChild(diagramContainer);

        parent.style.display = 'none';

        diagramBtn.addEventListener('click', () => {
          parent.style.display = 'none';
          diagramContainer.style.display = 'block';
          diagramBtn.classList.add('active');
          codeBtn.classList.remove('active');
        });

        codeBtn.addEventListener('click', () => {
          parent.style.display = '';
          diagramContainer.style.display = 'none';
          codeBtn.classList.add('active');
          diagramBtn.classList.remove('active');
        });
      }

      const diagram = wrapper.querySelector('.nlm-mermaid-diagram');
      if (diagram) {
        // 使用 mermaid.ink 生成 SVG 图片绕过脚本 CSP 限制
        const base64Code = toBase64Url(normalizedCode);
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.classList.contains('dark');
        const theme = isDark ? '?bgColor=333&theme=dark' : '?bgColor=fff';
        
        diagram.innerHTML = `<img src="https://mermaid.ink/svg/${base64Code}${theme}" alt="Mermaid Diagram" style="max-width: 100%; height: auto;" />`;
      }

      codeEl.dataset.mermaidCode = normalizedCode;
      codeEl.dataset.mermaidProcessing = 'false';
    } catch (e) {
      console.error(LOG, e);
      codeEl.dataset.mermaidProcessing = 'false';
    }
  }

  /**
   * 扫描并处理所有代码块
   */
  function processCodeBlocks() {
    // 查找代码块
    const codeEls = document.querySelectorAll('pre code, code[data-test-id="code-content"]');
    codeEls.forEach((codeEl) => {
      const text = codeEl.textContent || '';
      // 检查语言标记
      const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));
      if (langClass === 'language-mermaid') {
        renderBlock(codeEl, text);
        return;
      }
      // 内容检测
      if (isMermaidCode(text)) {
        renderBlock(codeEl, text);
      }
    });
  }

  // === 公开 API ===
  function init() {
    if (isInitialized) return;

    processCodeBlocks();

    let debounceTimer;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(processCodeBlocks, 1000);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    isInitialized = true;
    console.log(LOG, '已启动');
  }

  function destroy() {
    if (observer) observer.disconnect();
    observer = null;
    isInitialized = false;
  }

  return { init, destroy };
})();
