<div align="center">
  <h1>📓 NLM Enhancer</h1>
  <p>
    <b>Google NotebookLM 的生产力增强补丁。</b><br>
    完美 MathML/LaTeX 公式导出、纯净 Markdown 下载、以及对话时间轴导航。
  </p>

  <p>
    <a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID" target="_blank">
      <img src="https://img.shields.io/badge/Chrome_Web_Store-Pending-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
    </a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
    <img src="https://img.shields.io/github/stars/komazhou/NLM-Enhancer?style=flat-square&logo=github" alt="GitHub stars">
  </p>
  
  <p>
    <a href="./README.md">English</a> • 
    **简体中文**
  </p>
</div>

---

## 👋 为什么需要 NLM Enhancer?

Google 的 NotebookLM 是一款极其出色的文档分析工具，但对于研究人员、学生和专业人士来说，它存在一个令人沮丧的瓶颈：**导出复杂的数学公式。**

当你从 NotebookLM 复制极限、积分或矩阵并粘贴到 Microsoft Word 或 Markdown 编辑器时，格式会完全崩坏。

**NLM Enhancer** 正是为了解决这个问题而诞生的。通过深度 DOM 逆向解析技术，它能够无损地提取 NotebookLM 渲染的公式，并将其转换为标准的 LaTeX 或 MathML。不再有乱码，只有完美的公式，随时可用于您的论文、专利或研究报告。

---

## ✨ 核心功能

### 📐 完美公式提取
- **点击即复制**：点击 NotebookLM 中的任何公式，即可立即复制其源代码。
- **MathML (Word) 支持**：直接将复杂的矩阵和微积分粘贴到 Microsoft Word 中，而不会丢失结构。
- **标准 LaTeX**：为学术写作提取纯净的 LaTeX 方程。

### 💾 纯净 Markdown 导出
- 一键将整个对话历史导出为干净的 `.md` 或 `.pdf` 文件。
- 完美保留块状公式、加粗文本和列表，适配 Obsidian 和 Typora 等工具。

### 📍 时间轴导航与 UI 控制
- **对话时间轴**：视觉化侧边栏节点允许您在长消息之间瞬间跳转。
- **消息显隐**：隐藏不需要的消息，让您的工作区保持专注。
- **视频无水印下载**：去除 NotebookLM 生成的视频概览中的品牌水印，实现本地纯净下载。
- **防自动滚动**：点击发送后，停止烦人的页面自动跳转。

### 💡 提示词库
- 保存并快速插入您最常用的研究提示词（Prompts）。

---

## 🔒 隐私与安全 (零数据收集)

本扩展 **100% 本地运行**。
- 🚫 **无** 外部网络请求。
- 🚫 **无** 用户数据收集。
- 🚫 **无** 远程追踪代码。
您的敏感文档和对话历史严格保留在您的浏览器和 Google 服务器之间。

---

## 📥 安装说明

### 选项 1: Chrome 网上应用店
*(审核中，链接即将到来！)*

### 选项 2: 手动安装 (开发者模式)
1. 从 [Releases](#) 页面下载最新的 `NLM-Enhancer-main.zip` 或克隆本仓库。
2. 解压文件到文件夹。
3. 在浏览器地址栏输入 `chrome://extensions/`。
4. 开启右上角的 **“开发者模式”**。
5. 点击 **“加载已解压的扩展程序”** 并选择解压后的文件夹。

---

## 🙏 致谢与声明

本项目深度启发自 [**Gemini Voyager**](https://github.com/Nagi-ovo/gemini-voyager)。

虽然 Voyager 彻底改变了 Google Gemini 的 UI 和文件夹组织方式，但 **NLM Enhancer** 是从零开始（在 AI 的深度协助下）构建的，旨在解决一个完全不同的、高度特定的技术挑战：逆向工程 NotebookLM 复杂的 DOM 以提取无损公式。

我们采用了 Voyager 一些优雅的 UI 概念（如时间轴和提示词库），以提供熟悉且高效的体验。衷心感谢 Voyager 开发团队和开源社区在 AI 工作空间增强方面的开拓性贡献！

---

## ☕ 支持开发者

这个工具诞生于个人爱好，旨在解决现实工作流中的痛点。如果 NLM Enhancer 帮您解决了排版上的困扰，考虑请我喝杯咖啡。您的支持是我持续更新的动力！❤️

<div align="center">
  <p><b>通过微信 / 支付宝支持：</b></p>
  <table align="center" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" width="200">
        <img src="docs/wechat.png" alt="WeChat Pay" height="160"><br>
        <sub><b>微信支付 (WeChat Pay)</b></sub>
      </td>
      <td align="center" width="200">
        <img src="docs/alipay.png" alt="Alipay" height="160"><br>
        <sub><b>支付宝 (Alipay)</b></sub>
      </td>
    </tr>
  </table>
</div>
