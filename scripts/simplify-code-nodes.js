#!/usr/bin/env node
/**
 * Remove ClickUp API calls from Code nodes since we can't access credentials
 * The ClickUp error posting is informational only - we'll just log errors instead
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '../workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = JSON.parse(content);
  let changes = 0;
  
  workflow.nodes.forEach(node => {
    if (node.parameters?.jsCode) {
      let code = node.parameters.jsCode;
      
      // Replace the ClickUp API helper calls with just console.log
      // Pattern: try { await this.helpers.request({ ... uri: ...clickup... }) } catch ...
      if (code.includes('this.helpers.request') && code.includes('clickup.com')) {
        // Instead of trying to fix complex regex, let's just comment out these blocks
        // by replacing the helper.request calls with console.log
        
        // For error posting to ClickUp - just skip it
        code = code.replace(
          /await this\.helpers\.request\(\{[^}]+uri:[^}]+clickup\.com[^}]+\}[^}]*\}[^;]*\);/gs,
          "console.log('Skipping ClickUp API call - credentials not available in Code nodes');"
        );
        
        changes++;
      }
      
      node.parameters.jsCode = code;
    }
  });
  
  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.log(`✅ ${file}: simplified ${changes} Code nodes`);
  }
});

console.log('\nDone!');
