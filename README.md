[English](./README_EN.md) | **简体中文**

<div align="center">

# 📓 NLM Enhancer

### LaTeX Export for NotebookLM

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Coming_Soon-4285F4?logo=googlechrome&logoColor=white)](https://github.com/komazhou/NLM-Enhancer)
[![GitHub](https://img.shields.io/badge/GitHub-Repo-181717?logo=github)](https://github.com/komazhou/NLM-Enhancer)

**解决 Google NotebookLM 导出公式时的排版崩塌、空白方框与乱码问题。**

</div>

---

## 🎯 核心痛点

当你在 NotebookLM 中处理包含数学公式的学术笔记时，是否遇到过以下问题：

- 📋 **复制公式到 Markdown** → 得到一堆红色钻石 `◆` 或空白方框 `□`
- 📄 **导出到 Microsoft Word** → 复杂积分、矩阵、上下标全部变为乱码
- 📝 **粘贴到笔记软件** → 公式直接丢失，只剩占位符

**NLM Enhancer** 从根本上解决了这一问题。它在页面层面拦截公式渲染结果，精准提取 LaTeX 源码，让你的数学笔记在任何编辑器中都能完美还原。

---

## ✨ 功能亮点

### 📐 LaTeX 公式导出（核心功能）

- **点击即复制**：单击页面中任意数学公式，自动提取并复制 LaTeX 源码
- **多格式支持**：LaTeX `$...$`、MathML (Word)、纯文本、Notion `$$...$$`
- **智能选区复制**：选中包含公式的文本段落，Ctrl+C 即可得到完整的 LaTeX 混排文本
- **完美还原**：微积分、矩阵、分式、上下标、希腊字母——全部精准提取

### 🔘 对话时间轴导航

- 页面右侧显示用户提问的圆点时间轴
- 单击圆点快速跳转至对应提问
- 悬停预览提问内容
- 左侧搜索面板，模糊搜索历史提问

### 📥 纯净 Markdown 导出

- 一键导出当前对话为干净的 Markdown 文件
- 自动剔除 NotebookLM 的引用标注、操作按钮等干扰元素
- 导出预览支持逐条删除，灵活筛选内容
- 同时支持另存为 PDF

### 💬 选中一键引用

- 选中任意回复文本，弹出「引用」浮动按钮
- 点击后自动将内容以引用格式插入输入框
- 保留 LaTeX 公式语法，引用内容不丢失格式

### ⚡ 提示词库

- 内置常用提示词模板（摘要总结、费曼解释、对比分析等）
- 支持添加自定义提示词
- 一键插入输入框

### ⚙️ 输入增强

- **草稿防丢**：自动保存输入框内容，刷新页面后自动恢复
- **Ctrl+Enter 发送**：Enter 变为换行，防止误触发送
- **防自动滚动**：AI 生成回复时上滚查看历史，不会被强制拉回底部

---

## 📦 安装

> 目前处于开发者预览阶段，尚未上架 Chrome Web Store。

### 开发者模式安装

1. **下载源码**
   ```bash
   git clone https://github.com/komazhou/NLM-Enhancer.git
   ```

2. **打开 Chrome 扩展管理页面**
   - 在地址栏输入 `chrome://extensions/`
   - 开启右上角的「开发者模式」

3. **加载扩展**
   - 点击「加载已解压的扩展程序」
   - 选择克隆下来的 `NLM-Enhancer` 文件夹

4. **开始使用**
   - 打开 [NotebookLM](https://notebooklm.google.com/)
   - 点击浏览器工具栏中的 NLM Enhancer 图标，管理功能开关

---

## 🔒 隐私安全

**NLM Enhancer 承诺对用户数据零侵入。**

| 项目 | 状态 |
|------|------|
| 网络请求 | ❌ **零网络请求**——所有功能纯本地运行 |
| 数据收集 | ❌ **零数据收集**——不追踪、不上报、不分析 |
| 第三方服务 | ❌ 不调用任何外部 API 或分析平台 |
| 数据存储 | ✅ 仅使用 `chrome.storage` 保存用户偏好设置 |
| 权限范围 | ✅ 仅在 `notebooklm.google.com` 域名下激活 |

你可以随时审查完整源码：[GitHub 仓库](https://github.com/komazhou/NLM-Enhancer)

---

## 🤝 支持开发者

如果 NLM Enhancer 对你的学习或研究有所帮助，欢迎请作者喝杯咖啡 ☕

<div align="center">

<img src="docs/donate-qrcode.png" width="250" alt="微信赞赏码">

*微信扫码赞赏*

</div>

---

## 📄 许可证

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
