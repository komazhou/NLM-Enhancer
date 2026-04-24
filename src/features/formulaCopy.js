/**
 * NotebookLM++ 公式点击复制模块
 * 点击页面中渲染的数学公式，按用户选择的格式复制到剪贴板
 * 支持格式：LaTeX ($...$)、MathML (Word)、纯文本 (无$)、Notion ($$...$$)
 *
 * 增强复制：选中含公式的段落 Ctrl+C 时，自动将公式替换为 LaTeX 文本
 */

var NLM = window.NLM || {};
window.NLM = NLM;

NLM.FormulaCopy = (() => {
  const LOG = '[NLM++ FormulaCopy]';
  let currentFormat = 'latex';
  let isInitialized = false;
  let katexLoaded = false;

  const I18N = {
    copied: '✓ 公式已复制',
    failed: '✗ 复制失败',
    noLatex: '✗ 无法提取源码',
  };

  // ========================================================
  // 公式查找与 LaTeX 提取（核心逻辑）
  // ========================================================

  /**
   * 从点击目标向上查找最近的公式容器
   */
  function findMathElement(target) {
    // 尝试多种选择器向上查找
    const selectors = [
      '.katex',            // KaTeX 渲染根
      '.katex-display',    // KaTeX 块级公式
      '[data-math]',       // Gemini 风格
      'mjx-container',     // MathJax 3
      '.MathJax',          // MathJax 2
      '.math-inline',      // 通用行内公式
      '.math-block',       // 通用块级公式
    ];

    for (const sel of selectors) {
      const found = target.closest(sel);
      if (found) return found;
    }

    return null;
  }

  /**
   * 从公式元素中提取 LaTeX 源码
   * 采用多种策略兼容不同渲染引擎和 DOM 结构
   */
  function extractLatex(element) {
    // === 策略1: data-math 属性 ===
    const dataMath = element.getAttribute('data-math');
    if (dataMath) return dataMath;

    // === 策略2: KaTeX annotation 元素 ===
    // KaTeX 结构：.katex > .katex-mathml > math > semantics > annotation
    // 注意：.katex-mathml 通常是隐藏的，但 querySelector 仍可访问
    // 使用多种方式查找 annotation（处理 XML 命名空间问题）
    const annotationSelectors = [
      'annotation[encoding="application/x-tex"]',
      'annotation[encoding="application/x-latex"]',
      'annotation',
    ];

    for (const sel of annotationSelectors) {
      try {
        const ann = element.querySelector(sel);
        if (ann?.textContent?.trim()) {
          return ann.textContent.trim();
        }
      } catch { /* 跳过选择器错误 */ }
    }

    // === 策略3: 通过 .katex-mathml 内的 math 元素 ===
    const katexMathml = element.querySelector('.katex-mathml');
    if (katexMathml) {
      // 尝试从 math > semantics > annotation 提取
      const mathEl = katexMathml.querySelector('math');
      if (mathEl) {
        // 遍历所有子元素查找 annotation
        const allChildren = mathEl.getElementsByTagName('*');
        for (const child of allChildren) {
          if (child.tagName.toLowerCase() === 'annotation' ||
              child.localName === 'annotation') {
            const encoding = child.getAttribute('encoding') || '';
            if (encoding.includes('tex') || encoding.includes('latex') || !encoding) {
              const text = child.textContent?.trim();
              if (text) return text;
            }
          }
        }

        // 如果找不到 annotation，尝试从 semantics 的 textContent 提取
        const semantics = mathEl.querySelector('semantics');
        if (semantics) {
          // 最后一个子元素通常是 annotation
          const lastChild = semantics.lastElementChild;
          if (lastChild && lastChild.textContent?.trim()) {
            // 检查是否像 LaTeX（包含 \ 或 ^ 或 _ 等特征字符）
            const text = lastChild.textContent.trim();
            if (text.includes('\\') || text.includes('^') || text.includes('_') ||
                text.includes('{') || text.length > 1) {
              return text;
            }
          }
        }
      }

      // 兜底：直接取 .katex-mathml 的文本（可能是 MathML 转文本）
      // 但这通常不是 LaTeX，跳过
    }

    // === 策略4: MathJax script 元素 ===
    const script = element.querySelector(
      'script[type="math/tex"], script[type="math/tex; mode=display"]'
    );
    if (script?.textContent) return script.textContent.trim();

    // === 策略5: data-latex 属性（MathJax 3） ===
    const dataLatex = element.getAttribute('data-latex') ||
                      element.querySelector('[data-latex]')?.getAttribute('data-latex');
    if (dataLatex) return dataLatex;

    // === 策略6: 从 MathML 还原 LaTeX ===
    const mathml = element.querySelector('.katex-mathml math');
    if (mathml) {
      try {
        const parsed = convertMathmlToLatex(mathml);
        if (parsed) return parsed;
      } catch (e) {
        console.warn(LOG, 'MathML 解析失败', e);
      }
    }

    // === 策略7: 从可见文本重构公式（最终兜底方案） ===
    // NotebookLM 甚至剥离了 MathML，只剩下 katex-html！此时只能硬解析 DOM 树。
    const katexHtml = element.querySelector('.katex-html');
    if (katexHtml) {
      try {
        const visibleText = extractVisibleMathText(katexHtml);
        if (visibleText) return visibleText;
      } catch (e) {
        console.warn(LOG, 'katex-html 解析失败', e);
      }
    }

    return null;
  }

  /**
   * 从 KaTeX HTML 渲染中提取可见的数学文本（用于 NotebookLM 缺失 LaTeX 和 MathML 时的终极兜底方案）
   * 采用基于布局（Layout-based）的逆向工程，通过解析 KaTeX 的 vlist 结构和 CSS 偏移量来还原公式
   */
  function extractVisibleMathText(katexHtmlEl) {
    const parts = [];

    function walk(node) {
      if (!node) return;
      
      // 处理文本节点
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        if (text && text.trim()) {
          // 符号映射表：处理 MathType 不识别的 Unicode 字符
          const symbolMap = {
            '\u2212': '-',       // 减号 (Minus sign)
            '\u22c5': '\\cdot ', // 点乘 (Dot operator)
            '\u2217': '*',       // 星号 (Asterisk)
            '\u00d7': '\\times ',
            '\u00f7': '\\div ',
            '\u00b1': '\\pm ',
            '\u2264': '\\leq ',
            '\u2265': '\\geq ',
            '\u2260': '\\neq ',
            '\u2248': '\\approx ',
            '\u221e': '\\infty ',
            '\u2202': '\\partial ',
            '\u2206': '\\Delta ',
            '\u03b1': '\\alpha ',
            '\u03b2': '\\beta ',
            '\u03b3': '\\gamma ',
            '\u03c0': '\\pi ',
            '\u03c3': '\\sigma ',
            '\u03bc': '\\mu ',
            '\u03c9': '\\omega ',
            '\u03a9': '\\Omega ',
            '\u2192': '\\rightarrow ',
            '\u222b': '\\int ',
            '\u2211': '\\sum ',
            '\u220f': '\\prod ',
          };

          // 逐个字符检查并替换
          let processed = '';
          for (const char of text) {
            processed += symbolMap[char] || char;
          }
          parts.push(processed);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node;
      const className = el.className || '';

      // 跳过不可见元素
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      // 跳过占位和装饰性元素
      if (className.includes('strut') || className.includes('pstrut')) return;
      if (className.includes('vlist-s')) return; // 间距元素

      // 1. 处理分数 (mfrac)
      if (className.includes('mfrac')) {
        // 在 KaTeX 中，分数由 vlist 承载。通常包含三个 span：分子、线、分母
        const rows = Array.from(el.querySelectorAll('.vlist > span[style*="top"]'));
        if (rows.length >= 2) {
          // 根据 top 值排序：最负（上）的是分子，最正（下）的是分母
          rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
          
          const numerRow = rows[0];
          const denomRow = rows[rows.length - 1];
          
          if (numerRow && denomRow && numerRow !== denomRow) {
            parts.push('\\frac{');
            walk(numerRow);
            parts.push('}{');
            walk(denomRow);
            parts.push('}');
            return;
          }
        }
      }

      // 2. 处理上下标 (msupsub)
      if (className.includes('msupsub')) {
        const rows = Array.from(el.querySelectorAll('.vlist > span[style*="top"]'));
        if (rows.length > 0) {
          // 排序：上标在前（top 小），下标在后（top 大）
          rows.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
          
          rows.forEach(row => {
            const top = parseFloat(row.style.top || '0');
            const rowText = row.innerText?.trim() || '';
            if (!rowText) return;

            // 经验阈值：上标通常在 -3.0em 以下（如 -3.67em），下标通常在 -2.8em 以上（如 -2.55em）
            if (top < -3.1) {
              parts.push('^{');
              walk(row);
              parts.push('}');
            } else {
              parts.push('_{');
              walk(row);
              parts.push('}');
            }
          });
          return;
        }
      }

      // 3. 处理根号 (msqrt)
      if (className.includes('msqrt')) {
        const body = el.querySelector('.mord');
        if (body) {
          parts.push('\\sqrt{');
          walk(body);
          parts.push('}');
          return;
        }
      }
      
      // 4. 处理括号和分隔符 (mopen, mclose)
      if (className.includes('mopen') || className.includes('mclose')) {
        const text = el.textContent.trim();
        if (text) {
          parts.push(text);
          return;
        }
      }

      // 5. 递归遍历子节点
      for (const child of el.childNodes) {
        walk(child);
      }
    }

    walk(katexHtmlEl);
    
    // 清理结果
    return parts.join('')
      .replace(/\s+/g, ' ')
      .trim() || null;
  }

  /**
   * 将 MathML 节点转换为 LaTeX 字符串
   * 递归解析 MathML DOM 树
   */
  function convertMathmlToLatex(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.children);
    const parse = (n) => convertMathmlToLatex(n);

    switch (tag) {
      case 'math':
      case 'mrow':
      case 'mstyle':
      case 'merror':
      case 'mpadded':
      case 'mphantom':
        return children.map(parse).join('');
        
      case 'mi': {
        const text = node.textContent.trim();
        // 处理特殊符号，如希腊字母或函数
        if (text.length > 1 && /^[A-Za-z]+$/.test(text)) {
          return `\\${text} `; // 例如 \sin, \cos
        }
        return text;
      }
      
      case 'mn':
        return node.textContent.trim();
        
      case 'mo': {
        const text = node.textContent.trim();
        const opMap = {
          '⁢': '', // Invisible times
          '⁡': '', // Invisible function application
          '±': '\\pm ',
          '×': '\\times ',
          '÷': '\\div ',
          '≤': '\\leq ',
          '≥': '\\geq ',
          '≠': '\\neq ',
          '≈': '\\approx ',
          '≡': '\\equiv ',
          '∞': '\\infty ',
          '→': '\\rightarrow ',
          '←': '\\leftarrow ',
          '∫': '\\int ',
          '∑': '\\sum ',
          '∏': '\\prod ',
          '∂': '\\partial ',
          '∇': '\\nabla ',
          'Δ': '\\Delta '
        };
        return opMap[text] !== undefined ? opMap[text] : text;
      }
        
      case 'msub':
        if (children.length === 2) {
          return `${parse(children[0])}_{${parse(children[1])}}`;
        }
        break;
        
      case 'msup':
        if (children.length === 2) {
          return `${parse(children[0])}^{${parse(children[1])}}`;
        }
        break;
        
      case 'msubsup':
        if (children.length === 3) {
          return `${parse(children[0])}_{${parse(children[1])}}^{${parse(children[2])}}`;
        }
        break;
        
      case 'mfrac':
        if (children.length === 2) {
          return `\\frac{${parse(children[0])}}{${parse(children[1])}}`;
        }
        break;
        
      case 'msqrt':
        return `\\sqrt{${children.map(parse).join('')}}`;
        
      case 'mroot':
        if (children.length === 2) {
          return `\\sqrt[${parse(children[1])}]{${parse(children[0])}}`;
        }
        break;
        
      case 'mfenced': {
        const open = node.getAttribute('open') || '(';
        const close = node.getAttribute('close') || ')';
        const separators = (node.getAttribute('separators') || ',').split('');
        
        let content = '';
        for (let i = 0; i < children.length; i++) {
          content += parse(children[i]);
          if (i < children.length - 1) {
            content += separators[Math.min(i, separators.length - 1)] || ',';
          }
        }
        return `\\left${open} ${content} \\right${close}`;
      }
      
      case 'mtable': {
        // 简单处理矩阵/表格
        const rows = children.filter(c => c.tagName.toLowerCase() === 'mtr' || c.tagName.toLowerCase() === 'mlabeledtr');
        const isCases = node.parentNode && node.parentNode.tagName.toLowerCase() === 'mfenced' && node.parentNode.getAttribute('open') === '{';
        
        const env = isCases ? 'cases' : 'matrix'; // 可以进一步通过类名推断 bmatrix 等
        
        let result = `\\begin{${env}}\n`;
        rows.forEach((row, i) => {
          const cells = Array.from(row.children).filter(c => c.tagName.toLowerCase() === 'mtd');
          result += cells.map(parse).join(' & ');
          if (i < rows.length - 1) result += ' \\\\\n';
        });
        result += `\n\\end{${env}}`;
        return result;
      }
        
      case 'mtext':
        return `\\text{${node.textContent}}`;
        
      case 'mspace':
        return ' '; // 简单处理空白
        
      default:
        // 未知标签尝试解析其子节点
        return children.map(parse).join('');
    }
    
    return children.map(parse).join('');
  }

  /**
   * 判断公式是否为块级
   */
  function isDisplayMode(element) {
    if (element.closest('.katex-display')) return true;
    if (element.closest('.math-block')) return true;
    if (element.querySelector('math[display="block"]')) return true;
    if (element.closest('mjx-container[display="true"]')) return true;
    const style = window.getComputedStyle(element);
    if (style.display === 'block' && element.classList.contains('katex')) return true;
    return false;
  }

  /**
   * 去除公式已有的分隔符
   */
  function stripDelimiters(formula) {
    const t = formula.trim();
    if (t.startsWith('$$') && t.endsWith('$$')) return t.slice(2, -2);
    if (t.startsWith('\\[') && t.endsWith('\\]')) return t.slice(2, -2);
    if (t.startsWith('\\(') && t.endsWith('\\)')) return t.slice(2, -2);
    if (t.startsWith('$') && t.endsWith('$')) return t.slice(1, -1);
    return formula;
  }

  /**
   * 按格式包装公式
   */
  function wrapFormula(formula, isBlock) {
    const raw = stripDelimiters(formula);
    const result = { text: '', html: '' };

    // 尝试生成 MathML (如果 katex 可用)
    let mathml = '';
    if (window.katex) {
      try {
        mathml = window.katex.renderToString(raw, {
          displayMode: isBlock,
          output: 'mathml'
        });
      } catch (e) {
        console.warn(LOG, 'KaTeX 生成 MathML 失败', e);
      }
    }

    switch (currentFormat) {
      case 'mathml':
        // MathML 格式主要用于粘贴到 Word。
        // 为了提高 Word 的识别率，必须包含 xmlns 命名空间。
        result.text = raw;
        if (mathml) {
          result.html = mathml;
        } else {
          // 兜底：手动添加命名空间
          result.html = `<math xmlns="http://www.w3.org/1998/Math/MathML">${raw}</math>`;
        }
        break;

      case 'no-dollar':
        result.text = raw;
        break;

      case 'notion':
        result.text = `$$${raw}$$`;
        break;

      case 'latex':
      default:
        // MathType 转换 LaTeX 时，不支持 $$ $$ 作为块级公式包围符，会导致转换后遗留 $ 符号。
        // 标准 LaTeX 推荐使用 \[ \] 作为块级公式包围符，这完美兼容 Word/MathType 的转换。
        result.text = isBlock ? `\\[${raw}\\]` : `$${raw}$`;
        // 如果是 LaTeX 格式，我们在 HTML 剪贴板中也带上 MathML，提高 Word 的识别成功率
        if (mathml) {
          result.html = mathml;
        }
        break;
    }
    return result;
  }

  // ========================================================
  // 剪贴板操作
  // ========================================================

  async function copyToClipboard(text, html) {
    try {
      if (navigator.clipboard?.write && html) {
        // 如果是 MathML (HTML 格式)，包装在标准 HTML 结构中以提高 Office 软件识别率
        let finalHtml = html;
        if (html.includes('<math')) {
          finalHtml = `<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`;
        }
        
        const items = {
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([finalHtml], { type: 'text/html' }),
        };
        await navigator.clipboard.write([new ClipboardItem(items)]);
        return true;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      // 兜底方案
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch (e) {
      console.error(LOG, '剪贴板操作失败', e);
      return false;
    }
  }

  // ========================================================
  // 事件处理
  // ========================================================

  /**
   * 点击事件处理器
   */
  async function handleClick(event) {
    const target = event.target;
    const mathEl = findMathElement(target);
    if (!mathEl) return;

    // 阻止事件继续
    event.preventDefault();
    event.stopPropagation();

    const latex = extractLatex(mathEl);
    if (!latex) {
      console.warn(LOG, '找到公式元素但无法提取 LaTeX 源码。元素:', mathEl.outerHTML?.substring(0, 300));
      NLM.DOM.showToast(I18N.noLatex, event.clientX, event.clientY, false);
      return;
    }

    const isBlock = isDisplayMode(mathEl);
    const { text, html } = wrapFormula(latex, isBlock);

    const success = await copyToClipboard(text, html);

    // 视觉反馈
    if (success) {
      mathEl.classList.add('nlm-formula-clicked');
      setTimeout(() => mathEl.classList.remove('nlm-formula-clicked'), 600);
    }

    NLM.DOM.showToast(
      success ? I18N.copied : I18N.failed,
      event.clientX,
      event.clientY,
      success
    );
  }

  // ========================================================
  // 增强复制：选中含公式段落 Ctrl+C 时将公式转为 LaTeX
  // ========================================================

  /**
   * 从 DocumentFragment 或 Element 中提取所有公式的 LaTeX
   * 并用 LaTeX 文本替换公式 DOM 节点
   */
  function replaceFormulasWithLatex(container) {
    // 处理来源标引（<sup> 等元素中仅含数字的）以及 Material Icons 文本（如 more_horiz）
    ['sup', '[data-citation]', '.citation', '.source-annotation',
     'button[class*="citation"]', '[class*="footnote"]', '[class*="superscript"]',
     'mat-icon', '.mat-icon', '.google-symbols'
    ].forEach((sel) => {
      try {
        container.querySelectorAll(sel).forEach((el) => {
          const text = (el.textContent || '').trim();
          // 过滤数字标引
          if (/^[\d,\s·]+$/.test(text) || text.length <= 3) {
            el.remove();
            return;
          }
          // 过滤特定的图标文本
          const iconTexts = [
            'more_horiz', 'expand_more', 'expand_less', 'content_copy', 'keep_pin', 
            'chat_bubble', 'more_vert', 'thumb_up', 'thumb_down', 'keep', 'copy_all',
            'good_response', 'bad_response', 'check', 'landscape_2', 'photo_spark'
          ];
          if (iconTexts.includes(text)) {
            // 尝试删除整个按钮、引用标记或相关的上层容器
            const parent = el.closest('button') || el.closest('.citation-marker') || 
                           el.closest('.source-annotation') || el.closest('.mat-mdc-card-actions') ||
                           el.closest('.suggestions-container') || el;
            parent.remove();
          }
        });
      } catch { /* 跳过 */ }
    });

    // 额外清理：彻底移除所有剩余的 mat-icon 和相关元素，这些通常不属于正文内容
    container.querySelectorAll('mat-icon, .mat-icon, .google-symbols, .mat-mdc-button-touch-target, .mat-mdc-button-persistent-ripple').forEach(el => el.remove());
    
    // 移除侧边建议和操作栏
    container.querySelectorAll('.mat-mdc-card-actions, .suggestions-container, .action-button, .pin-button').forEach(el => el.remove());

    // 替换 .katex 元素
    container.querySelectorAll('.katex').forEach((katexEl) => {
      const latex = extractLatex(katexEl);
      if (latex) {
        const isBlock = katexEl.closest('.katex-display') !== null;
        const wrapped = wrapFormula(latex, isBlock);
        
        if (wrapped.html) {
          // 如果有 HTML (MathML)，创建一个临时的 span 来承载
          const span = document.createElement('span');
          span.innerHTML = wrapped.html;
          katexEl.replaceWith(span);
        } else {
          katexEl.replaceWith(document.createTextNode(wrapped.text));
        }
      }
    });

    // 替换 [data-math]
    container.querySelectorAll('[data-math]').forEach((el) => {
      const latex = el.getAttribute('data-math');
      if (latex) {
        const isBlock = el.closest('.math-block') !== null;
        const wrapped = wrapFormula(latex, isBlock);
        el.replaceWith(document.createTextNode(wrapped.text));
      }
    });

    // 替换 MathJax
    container.querySelectorAll('mjx-container').forEach((mjx) => {
      const texEl = mjx.querySelector('script[type="math/tex"], script[type="math/tex; mode=display"]');
      if (texEl?.textContent) {
        const isBlock = mjx.getAttribute('display') === 'true';
        mjx.replaceWith(document.createTextNode(
          isBlock ? ` \\[${texEl.textContent.trim()}\\] ` : ` $${texEl.textContent.trim()}$ `
        ));
      }
    });
  }

  /**
   * 清理提取后的文本，合并被标引/公式拆散的换行
   */
  function cleanExtractedText(text) {
    return text
      .replace(/[ \t]+\n/g, '\n')         // 行尾空格
      .replace(/\n[ \t]+/g, '\n')          // 行首空格
      .replace(/\n{3,}/g, '\n\n')          // 合并多余换行
      .replace(/\s*\$\s*/g, ' $')          // 清理 $ 周围多余空格
      .replace(/\$\s+/g, '$')
      .replace(/\s+\$/g, '$')
      .replace(/\$ \$/g, '$$')             // 合并 $ $ 为 $$
      .trim();
  }

  /**
   * 增强复制事件处理
   */
  function handleCopy(event) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // 检查选中内容是否包含公式元素
    const hasMath = fragment.querySelector(
      '.katex, [data-math], mjx-container, .MathJax, .katex-mathml, annotation'
    );
    if (!hasMath) return; // 不含公式，交给浏览器默认处理

    // 替换公式为 LaTeX 文本
    replaceFormulasWithLatex(fragment);

    // 提取原生 HTML 结构用于富文本粘贴（保留加粗、列表和硬回车）
    const htmlWrapper = document.createElement('div');
    htmlWrapper.appendChild(fragment.cloneNode(true));
    // 清理 HTML 中的无用引用上标
    htmlWrapper.querySelectorAll('sup, [data-citation], .citation, .source-annotation').forEach(el => el.remove());
    const htmlContent = htmlWrapper.innerHTML;

    // 提取纯文本用于纯文本粘贴
    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none;';
    temp.appendChild(fragment);
    
    // 保护纯文本下的加粗和斜体（如果是粘贴到 Markdown 编辑器）
    temp.querySelectorAll('strong, b').forEach(el => {
      if (el.textContent.trim()) el.replaceWith(document.createTextNode(`**${el.textContent}**`));
    });
    temp.querySelectorAll('em, i').forEach(el => {
      if (el.textContent.trim()) el.replaceWith(document.createTextNode(`*${el.textContent}*`));
    });

    document.body.appendChild(temp);
    let processedText = temp.innerText ?? temp.textContent ?? '';
    temp.remove();

    // 清理纯文本的多余换行
    processedText = cleanExtractedText(processedText);

    // 覆盖剪贴板
    event.preventDefault();
    event.clipboardData.setData('text/plain', processedText);
    event.clipboardData.setData('text/html', htmlContent);

    console.log(LOG, '增强复制：已将公式转为 LaTeX 文本，并保留原生段落与格式');
  }

  // ========================================================
  // 公开 API
  // ========================================================

  async function init() {
    if (isInitialized) return;

    currentFormat = await NLM.Storage.get('formulaCopyFormat') || 'latex';

    NLM.Storage.onChange((changes, area) => {
      if (area === 'sync' && changes.formulaCopyFormat) {
        currentFormat = changes.formulaCopyFormat.newValue || 'latex';
        console.log(LOG, '格式已切换为:', currentFormat);
      }
    });

    document.addEventListener('click', handleClick, true);
    document.addEventListener('copy', handleCopy, true);
    isInitialized = true;
    console.log(LOG, '已启动，当前格式:', currentFormat);
  }

  function destroy() {
    if (!isInitialized) return;
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('copy', handleCopy, true);
    isInitialized = false;
  }

  return { init, destroy, extractLatex, findMathElement };
})();
