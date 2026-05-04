/**
 * NLM Enhancer 提示词库模块 (v1.3.0.5 增强版)
 * 采用统一的左下固定、右上拉伸交互规范，精准对齐 UI
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.PromptVault = (() => {
  const LOG = '[NLM Enhancer PromptVault]';

  function getBuiltinPrompts() {
    return [
      { id: 'b1', title: NLM.i18n.get('builtinPrompt1Title'), text: NLM.i18n.get('builtinPrompt1Text'), tags: ['📊'], isBuiltin: true },
      { id: 'b2', title: NLM.i18n.get('builtinPrompt2Title'), text: NLM.i18n.get('builtinPrompt2Text'), tags: ['🧠'], isBuiltin: true },
      { id: 'b3', title: NLM.i18n.get('builtinPrompt3Title'), text: NLM.i18n.get('builtinPrompt3Text'), tags: ['❓'], isBuiltin: true },
      { id: 'b4', title: NLM.i18n.get('builtinPrompt4Title'), text: NLM.i18n.get('builtinPrompt4Text'), tags: ['📝'], isBuiltin: true },
      { id: 'b5', title: NLM.i18n.get('builtinPrompt5Title'), text: NLM.i18n.get('builtinPrompt5Text'), tags: ['🔍'], isBuiltin: true },
      { id: 'b6', title: NLM.i18n.get('builtinPrompt6Title'), text: NLM.i18n.get('builtinPrompt6Text'), tags: ['🎯'], isBuiltin: true },
    ];
  }

  let triggerBtn = null;
  let panel = null;
  let userPrompts = [];
  let pinnedIds = [];
  let posTimer = null;
  let searchQuery = '';
  let viewMode = 'detail'; // detail, compact, grid
  let panelSize = { width: 380, height: 540 };

  async function loadData() {
    try {
      const data = await NLM.Storage.get('promptVaultData');
      const rawPrompts = data ? JSON.parse(data) : [];
      let needsMigrationSave = false;

      userPrompts = rawPrompts.map(p => {
        if (typeof p === 'object' && p.title && p.text) {
          const newP = {
            id: p.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
            title: p.title,
            text: p.text,
            tags: Array.isArray(p.tags) ? p.tags : (p.tags ? p.tags.split(/[,，]/).map(t => t.trim()) : []),
            updatedAt: p.updatedAt || Date.now()
          };
          if (p.pinned) {
            if (!pinnedIds.includes(newP.id)) pinnedIds.push(newP.id);
            needsMigrationSave = true;
          }
          return newP;
        }
        return null;
      }).filter(Boolean);

      const pinnedData = await NLM.Storage.get('promptVaultPinnedIds');
      if (pinnedData) pinnedIds = Array.from(new Set([...pinnedIds, ...pinnedData]));
      
      const modeData = await NLM.Storage.get('promptVaultViewMode');
      if (modeData) viewMode = modeData;

      const sizeData = await NLM.Storage.get('promptVaultPanelSize');
      if (sizeData) panelSize = sizeData;

      if (needsMigrationSave) await saveData();
    } catch {
      userPrompts = [];
      pinnedIds = [];
    }
  }

  async function saveData() {
    await NLM.Storage.set('promptVaultData', JSON.stringify(userPrompts));
    await NLM.Storage.set('promptVaultPinnedIds', pinnedIds);
    await NLM.Storage.set('promptVaultViewMode', viewMode);
    await NLM.Storage.set('promptVaultPanelSize', panelSize);
  }

  function createTriggerButton() {
    if (triggerBtn) return;
    triggerBtn = document.createElement('button');
    triggerBtn.className = 'nlm-prompt-trigger';
    triggerBtn.innerHTML = `⚡<span class="nlm-trigger-label">${NLM.i18n.get('promptVaultTitle')}</span>`;
    triggerBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    document.body.appendChild(triggerBtn);
  }

  function updateBtnPosition() {
    if (triggerBtn) {
      const container = NLM.DOM.findChatInputContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.top > 0) {
          triggerBtn.style.left = `${rect.left}px`;
          triggerBtn.style.top = `${rect.top - triggerBtn.offsetHeight}px`;
        }
      }
    }
    posTimer = requestAnimationFrame(updateBtnPosition);
  }

  function togglePanel() { panel ? closePanel() : openPanel(); }

  function openPanel() {
    if (panel) return;
    // 互斥逻辑：打开提示词库时，关闭历史记录和购物车
    if (NLM.QuestionHistory && NLM.QuestionHistory.closePanel) NLM.QuestionHistory.closePanel();
    if (NLM.StashCart && NLM.StashCart.closeCartPanel) NLM.StashCart.closeCartPanel();
    panel = document.createElement('div');
    panel.className = `nlm-prompt-panel nlm-view-${viewMode}`;
    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      const bottomOffset = window.innerHeight - rect.top; // 精准对齐按钮上沿
      panel.style.left = `${rect.left}px`; // 精准对齐按钮左沿
      panel.style.bottom = `${bottomOffset}px`;
      panel.style.width = `${panelSize.width}px`;
      panel.style.height = `${panelSize.height}px`;
    }
    setupPanelStructure();
    refreshList();
    document.body.appendChild(panel);
    setupResizeHandler();
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 100);
  }

  function setupPanelStructure() {
    panel.innerHTML = `
      <div class="nlm-resize-handle-tr" title="拖动右上角调整大小">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="2" y1="0" x2="12" y2="10" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
          <line x1="6" y1="0" x2="12" y2="6" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
          <line x1="10" y1="0" x2="12" y2="2" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.3" />
        </svg>
      </div>
      <div class="nlm-prompt-header">
        <div class="nlm-header-left">
          <h3>${NLM.i18n.get('promptVaultPanelTitle')}</h3>
          <div class="nlm-view-toggles">
            <button class="nlm-view-btn ${viewMode === 'detail' ? 'active' : ''}" data-mode="detail" title="详细列表">☰</button>
            <button class="nlm-view-btn ${viewMode === 'compact' ? 'active' : ''}" data-mode="compact" title="紧凑列表">☲</button>
            <button class="nlm-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-mode="grid" title="网格视图">▦</button>
          </div>
        </div>
        <button class="nlm-prompt-add-btn" title="${NLM.i18n.get('btnAddPrompt')}">+</button>
      </div>
      <div class="nlm-prompt-search-wrapper">
        <input type="text" class="nlm-prompt-search-input" placeholder="${NLM.i18n.get('searchPromptPlaceholder')}" />
      </div>
      <div class="nlm-prompt-list"></div>
      <div class="nlm-prompt-footer">
        <button class="nlm-footer-btn nlm-btn-export">${NLM.i18n.get('btnExportJson')}</button>
        <button class="nlm-footer-btn nlm-btn-import">${NLM.i18n.get('btnImportJson')}</button>
      </div>
    `;

    panel.querySelectorAll('.nlm-view-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        viewMode = btn.dataset.mode;
        panel.className = `nlm-prompt-panel nlm-view-${viewMode}`;
        panel.querySelectorAll('.nlm-view-btn').forEach(b => b.classList.toggle('active', b === btn));
        await saveData();
        refreshList();
      });
    });

    const searchInput = panel.querySelector('.nlm-prompt-search-input');
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; refreshList(); });
    panel.querySelector('.nlm-prompt-add-btn').addEventListener('click', () => showAddDialog());
    panel.querySelector('.nlm-btn-export').addEventListener('click', exportPrompts);
    panel.querySelector('.nlm-btn-import').addEventListener('click', importPrompts);
  }

  function setupResizeHandler() {
    const handle = panel.querySelector('.nlm-resize-handle-tr');
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX; startY = e.clientY;
      startWidth = panel.offsetWidth; startHeight = panel.offsetHeight;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    });

    function handleMouseMove(e) {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = startY - e.clientY;
      const newWidth = Math.max(300, startWidth + dx);
      const newHeight = Math.max(400, startHeight + dy);
      panel.style.width = `${newWidth}px`;
      panel.style.height = `${newHeight}px`;
      panelSize = { width: newWidth, height: newHeight };
    }

    function handleMouseUp() {
      if (isResizing) {
        isResizing = false; saveData();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    }
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (panel && !panel.contains(e.target) && e.target !== triggerBtn) closePanel();
  }

  function refreshList() {
    const listContainer = panel.querySelector('.nlm-prompt-list');
    if (!listContainer) return;

    const builtinPrompts = getBuiltinPrompts();
    const allPrompts = [...builtinPrompts, ...userPrompts].map(p => ({ ...p, isPinned: pinnedIds.includes(p.id) }));

    let filtered = allPrompts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = allPrompts.filter(p => p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q) || (p.tags && p.tags.some(t => t.toLowerCase().includes(q))));
    }

    filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    listContainer.innerHTML = `
      ${filtered.length === 0 ? `<div class="nlm-prompt-empty">${NLM.i18n.get('searchNoResults')}</div>` : ''}
      ${filtered.map(p => `
        <div class="nlm-prompt-item" data-id="${p.id}">
          <div class="nlm-prompt-item-main">
            <div class="nlm-prompt-item-title">
              ${p.isPinned ? '<span class="nlm-pin-icon">📌</span>' : ''}
              <span class="nlm-title-text">${p.title}</span>
            </div>
            ${viewMode !== 'compact' ? `<div class="nlm-prompt-item-tags">${(p.tags || []).map(t => `<span class="nlm-tag">${t}</span>`).join('')}</div>` : ''}
            ${viewMode !== 'compact' ? `<div class="nlm-prompt-item-preview">${p.text.substring(0, viewMode === 'grid' ? 100 : 60)}${p.text.length > 60 ? '...' : ''}</div>` : ''}
          </div>
          <div class="nlm-prompt-item-actions">
            <button class="nlm-action-pin" title="${p.isPinned ? NLM.i18n.get('btnUnpin') : NLM.i18n.get('btnPin')}">${p.isPinned ? '📍' : '📌'}</button>
            <button class="nlm-action-edit" title="${NLM.i18n.get('btnEdit')}">✏️</button>
            ${!p.isBuiltin ? `<button class="nlm-action-delete" title="${NLM.i18n.get('btnDelete')}">×</button>` : ''}
          </div>
        </div>
      `).join('')}
    `;

    listContainer.querySelectorAll('.nlm-prompt-item-main').forEach(main => {
      main.addEventListener('click', () => {
        const id = main.closest('.nlm-prompt-item').dataset.id;
        const prompt = allPrompts.find(p => p.id === id);
        if (prompt) { insertPrompt(prompt.text); closePanel(); }
      });
    });

    listContainer.querySelectorAll('.nlm-action-pin').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.closest('.nlm-prompt-item').dataset.id;
        const index = pinnedIds.indexOf(id);
        if (index > -1) pinnedIds.splice(index, 1); else pinnedIds.push(id);
        await saveData(); refreshList();
      });
    });

    listContainer.querySelectorAll('.nlm-action-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddDialog(btn.closest('.nlm-prompt-item').dataset.id);
      });
    });

    listContainer.querySelectorAll('.nlm-action-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.closest('.nlm-prompt-item').dataset.id;
        userPrompts = userPrompts.filter(p => p.id !== id);
        pinnedIds = pinnedIds.filter(pid => pid !== id);
        await saveData(); refreshList();
      });
    });
  }

  function insertPrompt(text) {
    const input = NLM.DOM.findChatInput();
    if (input) {
      NLM.DOM.setInputText(input, text); input.focus();
      NLM.DOM.showToast(NLM.i18n.get('toastInserted'), window.innerWidth / 2, 100, true);
    }
  }

  function getAllTags() {
    const all = [...getBuiltinPrompts(), ...userPrompts];
    const tags = new Set();
    all.forEach(p => (p.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags);
  }

  function showAddDialog(editId = null) {
    const allPrompts = [...getBuiltinPrompts(), ...userPrompts];
    const prompt = editId ? allPrompts.find(p => p.id === editId) : null;
    const isEditingBuiltin = prompt && prompt.isBuiltin;
    const existingTags = getAllTags();

    const dialog = document.createElement('div');
    dialog.className = 'nlm-prompt-dialog';
    dialog.innerHTML = `
      <div class="nlm-prompt-dialog-content">
        <h3>${(prompt && !isEditingBuiltin) ? NLM.i18n.get('dialogEditPromptTitle') : NLM.i18n.get('dialogAddPromptTitle')}</h3>
        <input type="text" placeholder="${NLM.i18n.get('dialogPromptTitlePlaceholder')}" class="nlm-prompt-dialog-title" value="${prompt ? prompt.title : ''}" />
        <div class="nlm-tags-manager">
          <input type="text" placeholder="${NLM.i18n.get('dialogPromptTagsPlaceholder')}" class="nlm-prompt-dialog-tags" value="${prompt ? (prompt.tags || []).join(', ') : ''}" />
          <div class="nlm-tags-suggestions">
            ${existingTags.map(t => `<span class="nlm-tag-suggest" data-tag="${t}">${t}</span>`).join('')}
          </div>
        </div>
        <textarea placeholder="${NLM.i18n.get('dialogPromptTextPlaceholder')}" class="nlm-prompt-dialog-text" rows="8">${prompt ? prompt.text : ''}</textarea>
        <div class="nlm-prompt-dialog-actions">
          <button class="nlm-btn-cancel">${NLM.i18n.get('btnCancel')}</button>
          <button class="nlm-btn-save">${NLM.i18n.get('btnSave')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('.nlm-tag-suggest').forEach(tagBtn => {
      tagBtn.addEventListener('click', () => {
        const input = dialog.querySelector('.nlm-prompt-dialog-tags');
        const current = input.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
        const newTag = tagBtn.dataset.tag;
        if (!current.includes(newTag)) { current.push(newTag); input.value = current.join(', '); }
      });
    });

    dialog.querySelector('.nlm-btn-cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.nlm-btn-save').addEventListener('click', async () => {
      const title = dialog.querySelector('.nlm-prompt-dialog-title').value.trim();
      const tagsRaw = dialog.querySelector('.nlm-prompt-dialog-tags').value.trim();
      const text = dialog.querySelector('.nlm-prompt-dialog-text').value.trim();
      if (title && text) {
        const tags = tagsRaw ? tagsRaw.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
        if (prompt && !isEditingBuiltin) {
          prompt.title = title; prompt.tags = tags; prompt.text = text; prompt.updatedAt = Date.now();
        } else {
          userPrompts.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 5), title, text, tags, updatedAt: Date.now() });
        }
        await saveData(); if (panel) refreshList(); dialog.remove();
        NLM.DOM.showToast(NLM.i18n.get('toastSaved'), window.innerWidth / 2, 100, true);
      }
    });
  }

  function exportPrompts() {
    const blob = new Blob([JSON.stringify(userPrompts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `NLM-Prompts-${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importPrompts() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            if (confirm(NLM.i18n.get('toastImportSuccess') + '？')) {
              userPrompts = [...userPrompts, ...imported.filter(p => p.title && p.text).map(p => ({ ...p, id: p.id || Date.now().toString() + Math.random().toString(36).substr(2, 5) }))];
              const seen = new Set();
              userPrompts = userPrompts.filter(p => { const key = p.title + p.text; if (seen.has(key)) return false; seen.add(key); return true; });
              await saveData(); if (panel) refreshList();
            }
          }
        } catch { NLM.DOM.showToast(NLM.i18n.get('toastImportError'), window.innerWidth / 2, 100, false); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function init() {
    await loadData();
    createTriggerButton();
    posTimer = requestAnimationFrame(updateBtnPosition);
    NLM.Storage.onChange(async (changes, area) => {
      if (area === 'sync' && (changes.promptVaultData || changes.promptVaultPinnedIds || changes.promptVaultViewMode || changes.promptVaultPanelSize)) {
        await loadData(); if (panel) refreshList();
      }
    });
    console.log(LOG, '已启动 (v1.3.1.1)');
  }

  function destroy() {
    closePanel();
    if (triggerBtn) triggerBtn.remove();
    if (posTimer) cancelAnimationFrame(posTimer);
    triggerBtn = null;
  }

  return { init, destroy, closePanel };
})();
