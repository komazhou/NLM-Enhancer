<div align="center">
  <h1>📓 NLM Enhancer</h1>
  <p>
    <b>The missing productivity power-up for Google's NotebookLM.</b><br>
    Perfect MathML/LaTeX export, pure Markdown downloads, and timeline navigation.
  </p>

  <p>
    <a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID" target="_blank">
      <img src="https://img.shields.io/badge/Chrome_Web_Store-Pending-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
    </a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
    <img src="https://img.shields.io/github/stars/komazhou/NLM-Enhancer?style=flat-square&logo=github" alt="GitHub stars">
  </p>
  
  <p>
    **English** • 
    <a href="./README_zh.md">简体中文</a>
  </p>
</div>

---

## 👋 Why NLM Enhancer?

Google's NotebookLM is an incredible tool for analyzing documents, but it has a frustrating bottleneck for researchers, students, and professionals: **Exporting complex mathematical formulas.**

When you copy limits, integrals, or matrices from NotebookLM and paste them into Microsoft Word or Markdown editors, the formatting completely breaks. 

**NLM Enhancer** was built to solve this exact problem. By utilizing deep DOM reverse-parsing technology, it losslessly extracts NotebookLM's rendered formulas and converts them into standard LaTeX or MathML. No more garbled text—just perfect equations ready for your thesis, patents, or research papers.

---

## ✨ Core Features

### 📐 Perfect Math Extraction
- **Click-to-Copy**: Click any formula in NotebookLM to instantly copy its source code.
- **MathML (Word) Support**: Paste complex matrices and calculus directly into Microsoft Word without losing structure.
- **Standard LaTeX**: Extract pure LaTeX equations for academic writing.

### 💾 Pure Markdown Export
- Export entire chat histories into clean `.md` or `.pdf` files with one click.
- Block formulas, bold text, and lists are perfectly preserved for tools like Obsidian and Typora.

### 📍 Timeline Navigation & UI Control
- **Chat Timeline**: Visual sidebar nodes allow you to jump between long messages instantly.
- **Message Toggling**: Hide unwanted messages to keep your workspace focused.
- **Prevent Auto-Scroll**: Stop the annoying page jump when hitting "Enter" to send a new prompt.

### 💡 Prompt Vault
- Save and quickly insert your most frequently used research prompts.

---

## 🔒 Privacy & Security (Zero Data Collection)

This extension operates **100% locally**. 
- 🚫 **NO** external network requests.
- 🚫 **NO** user data collection.
- 🚫 **NO** remote tracking code.
Your sensitive documents and chat histories remain strictly between your browser and Google's servers.

---

## 📥 Installation

### Option 1: Chrome Web Store
*(Currently under review, link coming soon!)*

### Option 2: Manual Installation (Developer Mode)
1. Download the latest `NLM-Enhancer-main.zip` from the [Releases](#) page or clone this repository.
2. Unzip the file to a folder.
3. Open your Chromium-based browser and navigate to `chrome://extensions/`.
4. Enable **"Developer mode"** in the top right corner.
5. Click **"Load unpacked"** and select the unzipped folder.

---

## 🙏 Acknowledgments & Credits

This project was profoundly inspired by [**Gemini Voyager**](https://github.com/Nagi-ovo/gemini-voyager). 

While Voyager revolutionized the UI and folder organization for Google Gemini, **NLM Enhancer** was built from the ground up (with extensive AI collaboration) to solve a completely different, highly specific technical challenge: reverse-engineering NotebookLM's complex DOM to extract lossless equations. 

We adopted some of Voyager's elegant UI concepts (like the Timeline and Prompt Vault) to provide a familiar and efficient experience. Huge thanks to the Voyager developer team and the open-source community for paving the way in AI workspace enhancements!

---

## ☕ Support the Developer

This tool was born out of a personal hobby and the genuine need to solve real-world workflow pain points. If NLM Enhancer has saved you from hours of formatting frustration, consider buying me a coffee. It helps keep the updates coming! ❤️

<div align="center">
  <p><b>Support via WeChat / Alipay:</b></p>
  <table align="center" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" width="200">
        <img src="docs/wechat.png" alt="WeChat Pay" height="160"><br>
        <sub><b>WeChat Pay (微信支付)</b></sub>
      </td>
      <td align="center" width="200">
        <img src="docs/alipay.png" alt="Alipay" height="160"><br>
        <sub><b>Alipay (支付宝)</b></sub>
      </td>
    </tr>
  </table>
</div>
