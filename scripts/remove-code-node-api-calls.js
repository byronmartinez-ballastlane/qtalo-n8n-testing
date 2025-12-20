#!/usr/bin/env node
/**
 * Remove all ClickUp API calls from Code nodes and Load Credentials references
 * n8n Cloud doesn't allow $env or credential access in Code nodes
 * 
 * Strategy:
 * - Remove this.helpers.request calls to ClickUp (error posting is nice-to-have)
 * - Remove references to $('Load Credentials')
 * - Keep Reply.io API calls but use the reply_api_key from config (from ClickUp custom field)
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '../workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Remove references to Load Credentials node
  if (content.includes("$('Load Credentials')")) {
    content = content.replace(/\$\('Load Credentials'\)\.first\(\)\.json\._credentials\?\.clickup_api_key/g, "''");
    content = content.replace(/\$\('Load Credentials'\)\.first\(\)\.json\._credentials\?\.reply_api_key/g, "''");
    content = content.replace(/\$\('Load Credentials'\)\.first\(\)\.json\._credentials/g, "{}");
    changes++;
    console.log(`  - Removed Load Credentials references`);
  }
  
  // Parse and process nodes
  const workflow = JSON.parse(content);
  
  workflow.nodes.forEach(node => {
    if (node.parameters?.jsCode) {
      let code = node.parameters.jsCode;
      const originalCode = code;
      
      // Remove ClickUp API posting blocks (try/catch with clickup.com)
      // These are informational only and not critical
      if (code.includes('clickup.com/api/v2/task') && code.includes('this.helpers.request')) {
        // Replace the entire try-catch block for ClickUp with just a console.log
        code = code.replace(
          /\/\/ Try to post (?:error|warning) comment to ClickUp\s*\n\s*(?:if \([^)]+\) \{\s*)?\n?\s*try \{[\s\S]*?api\.clickup\.com[\s\S]*?\} catch \([^)]+\) \{[\s\S]*?\}\s*\n?\s*\}?/g,
          '// Skipping ClickUp comment - credentials not available in Code nodes\n    console.log("Would post to ClickUp but credentials not accessible in Code node");'
        );
        
        if (code !== originalCode) {
          changes++;
          console.log(`  - Simplified ${node.name}: removed ClickUp API calls`);
        }
      }
      
      node.parameters.jsCode = code;
    }
  });
  
  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.log(`✅ ${file}: ${changes} changes`);
  } else {
    console.log(`   ${file}: no changes needed`);
  }
});

console.log('\n✅ Done!');
