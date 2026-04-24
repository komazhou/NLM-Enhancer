const fs = require('fs');
const html = fs.readFileSync('D:/Dev_Git/NotebookLM++/demo.html', 'utf8');
const parts = html.split('class="katex"');
if (parts.length > 1) {
  // Try to find the closing span for the katex span
  let chunk = '<span class="katex"' + parts[1].substring(0, 3000);
  fs.writeFileSync('D:/Dev_Git/NotebookLM++/scratch/katex_sample.html', chunk);
  console.log('Sample written to scratch/katex_sample.html');
}
