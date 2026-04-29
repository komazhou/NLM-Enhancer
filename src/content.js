/**
 * NLM Enhancer 内容脚本主入口
 * 根据用户设置有条件地启动各功能模块
 */

(async () => {
  const LOG = '[NLM Enhancer]';
  console.log(LOG, '扩展已加载，正在初始化...');

  try {
    // 先初始化 i18n 模块，确保后续模块可以获取翻译
    await NLM.i18n.init();

    const settings = await NLM.Storage.getAll();

    // 功能模块启动
    if (settings.quoteReplyEnabled) {
      NLM.QuoteReply.init();
    }

    if (settings.formulaCopyEnabled) {
      await NLM.FormulaCopy.init();
    }

    if (settings.timelineEnabled) {
      NLM.Timeline.init();
      NLM.TimelineSearch.init();
    }

    if (settings.exportEnabled) {
      NLM.Export.init();
    }

    if (settings.stashCartEnabled) {
      NLM.StashCart.init();
    }

    if (settings.promptVaultEnabled) {
      await NLM.PromptVault.init();
    }

    // 以下模块自行管理 enabled 状态
    await NLM.DraftSave.init();
    await NLM.SendBehavior.init();
      if (NLM.UiTweaks) NLM.UiTweaks.init();
      if (NLM.PreventScroll) NLM.PreventScroll.init();

    // 监听设置变更以动态启用/禁用模块
    NLM.Storage.onChange((changes, area) => {
      if (area !== 'sync') return;

      if (changes.quoteReplyEnabled) {
        if (changes.quoteReplyEnabled.newValue) NLM.QuoteReply.init();
        else NLM.QuoteReply.destroy();
      }

      if (changes.formulaCopyEnabled) {
        if (changes.formulaCopyEnabled.newValue) NLM.FormulaCopy.init();
        else NLM.FormulaCopy.destroy();
      }

      if (changes.timelineEnabled) {
        if (changes.timelineEnabled.newValue) {
          NLM.Timeline.init();
          NLM.TimelineSearch.init();
        } else {
          NLM.Timeline.destroy();
          NLM.TimelineSearch.destroy();
        }
      }

      if (changes.exportEnabled) {
        if (changes.exportEnabled.newValue) NLM.Export.init();
        else NLM.Export.destroy();
      }

      if (changes.stashCartEnabled) {
        if (changes.stashCartEnabled.newValue) NLM.StashCart.init();
        else NLM.StashCart.destroy();
      }

      if (changes.promptVaultEnabled) {
        if (changes.promptVaultEnabled.newValue) NLM.PromptVault.init();
        else NLM.PromptVault.destroy();
      }
    });

    console.log(LOG, '✅ 全部模块初始化完成');
  } catch (err) {
    console.error(LOG, '初始化失败:', err);
  }
})();
