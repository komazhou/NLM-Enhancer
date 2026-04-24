const fs = require('fs');

const html = fs.readFileSync('D:/Dev_Git/NotebookLM++/demo.html', 'utf8');

// 1. Analyze message containers
console.log('--- Chat Containers ---');
const chatMatches = html.match(/class="[^"]*chat[^"]*"/g) || [];
console.log('Classes with "chat":', [...new Set(chatMatches)].slice(0, 10));

const messageMatches = html.match(/class="[^"]*message[^"]*"/g) || [];
console.log('Classes with "message":', [...new Set(messageMatches)].slice(0, 10));

// NotebookLM often uses custom elements or specific roles
console.log('Roles:', [...new Set(html.match(/role="[^"]+"/g))].slice(0, 10));

// Look for a middle column or main chat area
const mainMatch = html.match(/<main[^>]*>/);
console.log('Main element:', mainMatch ? mainMatch[0] : 'None');

// 2. Analyze KaTeX structure
console.log('\n--- KaTeX Structure ---');
const katexInstances = html.split('class="katex"');
if (katexInstances.length > 1) {
  console.log('Found katex instances:', katexInstances.length - 1);
  const sample = 'class="katex"' + katexInstances[1].substring(0, 800);
  console.log('Sample KaTeX element:\n', sample);
  
  // Check if annotation exists
  const hasAnnotation = sample.includes('annotation');
  console.log('Has annotation tag:', hasAnnotation);
  
  // Check for MathML
  const hasMathml = sample.includes('katex-mathml');
  console.log('Has katex-mathml:', hasMathml);
} else {
  console.log('No katex found, searching for other math...');
  const mathMatches = html.match(/<math[^>]*>.*?<\/math>/gs) || [];
  console.log('Math tags:', mathMatches.length);
  if (mathMatches.length > 0) {
    console.log('Sample math:', mathMatches[0].substring(0, 200));
  }
}
