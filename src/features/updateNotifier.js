/**
 * NLM Enhancer - 版本更新提示模块
 */

(function() {
  const LOG = '[NLM Update]';
  const NLM = window.NLM || {};
  const i18n = NLM.i18n;

  /**
   * 显示更新日志弹窗
   * @param {string} version 版本号
   */
  function showUpdateModal(version) {
    // 确保 i18n 已加载
    if (!i18n) {
      console.error(LOG, 'i18n object not found!');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'nlm-modal-overlay nlm-update-notice-overlay';

    overlay.innerHTML = `
      <div class="nlm-modal nlm-media-modal nlm-update-modal">
        <div class="nlm-modal-header">
          <div class="nlm-modal-title">
            <span>${i18n.get('updateTitle').replace('[VERSION]', version)}</span>
          </div>
        </div>
        <div class="nlm-modal-body">
          <div class="nlm-update-content">
            <div class="nlm-feature-item">
              <div class="nlm-feature-icon">✨</div>
              <div class="nlm-feature-text">
                <strong>${i18n.get('updateFeature1')}</strong>
                <p style="margin-top: 4px; font-size: 12px; color: #64748b; line-height: 1.5;">
                  ${i18n.get('updateFeature1Desc')}
                </p>
              </div>
            </div>
            <!-- 可以根据需要添加更多亮点 -->
          </div>

          <div class="nlm-modal-actions" style="margin-top: 30px;">
            <button class="nlm-btn-primary" id="nlmGotIt">
              ${i18n.get('updateBtn')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btn = overlay.querySelector('#nlmGotIt');
    btn.onclick = () => {
      overlay.remove();
    };
  }

  /**
   * 初始化检查
   */
  async function init() {
    try {
      const { nlmPendingUpdate } = await chrome.storage.local.get('nlmPendingUpdate');
      const currentVersion = chrome.runtime.getManifest().version;

      if (nlmPendingUpdate === currentVersion) {
        // 标记匹配，显示弹窗
        // 延迟一小会儿显示，避免页面还没渲染好
        setTimeout(() => {
          showUpdateModal(currentVersion);
        }, 1500);

        // 立即清除标记，确保只弹一次
        await chrome.storage.local.remove('nlmPendingUpdate');
      }
    } catch (err) {
      console.error(LOG, 'Check failed:', err);
    }
  }

  // 启动
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
