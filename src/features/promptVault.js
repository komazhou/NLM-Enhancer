/**
 * NLM Enhancer 提示词库模块
 * 在输入框附近注入快捷图标，点击展开提示词库面板，一键插入预设提示词
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.PromptVault = (() => {
  const LOG = '[NLM Enhancer PromptVault]';

  // 内置默认提示词
  const BUILTIN_PROMPTS = [
    { title: '📊 提取关键信息制表', text: '请从上传的文档中提取所有关键数据和核心论点，以表格形式呈现，包含序号、要点、详细说明三列。' },
    { title: '🧠 费曼技巧解释', text: '请用费曼技巧（假设我是一个完全不懂这个领域的人）来向我解释上述文档中最核心的概念。' },
    { title: '❓ 生成思考题', text: '基于上传的文档内容，生成10个有深度的思考题和讨论问题，帮助我更好地理解和消化这些材料。' },
    { title: '📝 摘要总结', text: '请为上述文档撰写一份结构化的摘要，包含：背景、核心观点、关键论据、结论，每个部分不超过3句话。' },
    { title: '🔍 对比分析', text: '请对比文档中提到的不同观点/方案/理论，列出它们各自的优缺点和适用场景。' },
    { title: '🎯 行动计划', text: '基于文档的建议和结论，帮我制定一个可执行的行动计划，包含具体步骤、时间节点和预期成果。' },
  ];

  let triggerBtn = null;
  let panel = null;
  let userPrompts = [];
  let observer = null;

  /**
   * 加载用户自定义提示词
   */
  async function loadUserPrompts() {
    try {
      const data = await NLM.Storage.get('promptVaultData');
      userPrompts = data ? JSON.parse(data) : [];
    } catch {
      userPrompts = [];
    }
  }

  /**
   * 保存用户自定义提示词
   */
  async function saveUserPrompts() {
    await NLM.Storage.set('promptVaultData', JSON.stringify(userPrompts));
  }

  /**
   * 创建触发按钮
   */
  function createTriggerButton() {
    if (triggerBtn) return;

    triggerBtn = document.createElement('button');
    triggerBtn.className = 'nlm-prompt-trigger';
    triggerBtn.innerHTML = '⚡';
    triggerBtn.title = '提示词库';

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    // 将按钮注入到页面
    document.body.appendChild(triggerBtn);
  }

  let posTimer = null;

  /**
   * 定位触发按钮到输入框附近
   */
  function updateBtnPosition() {
    if (triggerBtn) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.top > 0) {
          triggerBtn.style.right = 'auto';
          triggerBtn.style.bottom = 'auto';
          // 左侧按钮对齐输入框容器左边缘，底边贴合容器顶边
          triggerBtn.style.left = `${rect.left}px`;
          triggerBtn.style.top = `${rect.top - triggerBtn.offsetHeight}px`;
          
          if (panel && panel.style.display !== 'none') {
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = `${rect.left}px`;
            // 面板向上展开，保留一点间隙
            panel.style.top = `${rect.top - triggerBtn.offsetHeight - 8 - panel.offsetHeight}px`;
          }
        }
      }
    }
    posTimer = requestAnimationFrame(updateBtnPosition);
  }

  /**
   * 切换面板显示
   */
  function togglePanel() {
    if (panel) {
      closePanel();
    } else {
      openPanel();
    }
  }

  /**
   * 打开提示词库面板
   */
  function openPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.className = 'nlm-prompt-panel';

    renderPanelContent();

    document.body.appendChild(panel);

    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== triggerBtn) {
      closePanel();
    }
  }

  /**
   * 渲染面板内容
   */
  function renderPanelContent() {
    if (!panel) return;

    const allPrompts = [...BUILTIN_PROMPTS, ...userPrompts];

    panel.innerHTML = `
      <div class="nlm-prompt-header">
        <h3>⚡ 提示词库</h3>
        <button class="nlm-prompt-add-btn" title="添加自定义提示词">+</button>
      </div>
      <div class="nlm-prompt-list">
        ${allPrompts.map((p, i) => `
          <div class="nlm-prompt-item" data-index="${i}" data-custom="${i >= BUILTIN_PROMPTS.length}">
            <div class="nlm-prompt-item-title">${p.title}</div>
            <div class="nlm-prompt-item-preview">${p.text.substring(0, 50)}...</div>
            ${i >= BUILTIN_PROMPTS.length ? '<button class="nlm-prompt-delete" title="删除">×</button>' : ''}
          </div>
        `).join('')}
      </div>
    `;

    // 绑定事件
    panel.querySelectorAll('.nlm-prompt-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('nlm-prompt-delete')) return;

        const idx = parseInt(item.dataset.index);
        const prompt = allPrompts[idx];
        if (prompt) {
          insertPrompt(prompt.text);
          closePanel();
        }
      });
    });

    // 删除按钮
    panel.querySelectorAll('.nlm-prompt-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.nlm-prompt-item');
        const idx = parseInt(item.dataset.index) - BUILTIN_PROMPTS.length;
        if (idx >= 0) {
          userPrompts.splice(idx, 1);
          saveUserPrompts();
          renderPanelContent();
        }
      });
    });

    // 添加按钮
    const addBtn = panel.querySelector('.nlm-prompt-add-btn');
    addBtn?.addEventListener('click', () => {
      showAddDialog();
    });
  }

  /**
   * 插入提示词到输入框
   */
  function insertPrompt(text) {
    const input = NLM.DOM.findChatInput();
    if (!input) {
      NLM.DOM.showToast('未找到输入框', window.innerWidth / 2, 100, false);
      return;
    }

    NLM.DOM.setInputText(input, text);
    input.focus();
    NLM.DOM.showToast('✓ 已插入', window.innerWidth / 2, 100, true);
  }

  /**
   * 显示添加自定义提示词的对话框
   */
  function showAddDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'nlm-prompt-dialog';
    dialog.innerHTML = `
      <div class="nlm-prompt-dialog-content">
        <h3>添加自定义提示词</h3>
        <input type="text" placeholder="标题（如：📌 代码审查）" class="nlm-prompt-dialog-title" />
        <textarea placeholder="提示词内容..." class="nlm-prompt-dialog-text" rows="4"></textarea>
        <div class="nlm-prompt-dialog-actions">
          <button class="nlm-btn-cancel">取消</button>
          <button class="nlm-btn-save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector('.nlm-btn-cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.nlm-btn-save').addEventListener('click', () => {
      const title = dialog.querySelector('.nlm-prompt-dialog-title').value.trim();
      const text = dialog.querySelector('.nlm-prompt-dialog-text').value.trim();
      if (title && text) {
        userPrompts.push({ title, text });
        saveUserPrompts();
        renderPanelContent();
        dialog.remove();
        NLM.DOM.showToast('✓ 已保存', window.innerWidth / 2, 100, true);
      }
    });
  }

  // === 公开 API ===
  async function init() {
    await loadUserPrompts();
    createTriggerButton();

    // 定位按钮并持续监控
    posTimer = requestAnimationFrame(updateBtnPosition);

    // 监听存储变更
    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.promptVaultData) {
        try {
          userPrompts = JSON.parse(changes.promptVaultData.newValue || '[]');
          if (panel) renderPanelContent();
        } catch { /* 忽略解析错误 */ }
      }
    });

    console.log(LOG, '已启动');
  }

  function destroy() {
    closePanel();
    if (triggerBtn) triggerBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    triggerBtn = null;
  }

  return { init, destroy };
})();
