const fs = require('fs');
const html = fs.readFileSync('D:/Dev_Git/NotebookLM++/demo.html', 'utf8');

console.log('Search 1:', html.match(/D=aM.*?d/g));

// Look for any attribute containing D=a
const attrs = html.match(/[a-zA-Z-]+="[^"]*D=aM[^"]*"/g);
console.log('Attributes containing formula:', attrs);

// Find how angular data is stored
const ngData = html.match(/ng-reflect-[^=]+="[^"]*D=aM[^"]*"/g);
console.log('Angular data containing formula:', ngData);

// See if there's any JSON data injected
const scripts = html.match(/<script[^>]*>.*?<\/script>/gs) || [];
for (let i = 0; i < scripts.length; i++) {
    if (scripts[i].includes('D=aM')) {
        console.log(`Found formula in script ${i}, length: ${scripts[i].length}`);
    }
}
