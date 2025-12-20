#!/usr/bin/env node
/**
 * Fix $env references in workflow Code nodes for n8n Cloud compatibility
 * n8n Cloud restricts $env access in Code nodes
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '../workflows');

// Process each workflow file
const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

let totalChanges = 0;

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let workflow;
  
  try {
    workflow = JSON.parse(content);
  } catch (e) {
    console.log(`⚠️ Skipping ${file} - invalid JSON`);
    return;
  }
  
  let fileChanges = 0;
  
  workflow.nodes.forEach(node => {
    if (node.parameters?.jsCode) {
      let code = node.parameters.jsCode;
      
      // Replace $env.REPLY_API_KEY references in error messages with placeholder
      // Since we can't access $env, just remove the last 8 chars display
      if (code.includes('$env.REPLY_API_KEY.slice(-8)')) {
        code = code.replace(
          /\$env\.REPLY_API_KEY\.slice\(-8\)/g,
          "'********'"
        );
        fileChanges++;
      }
      
      // Replace || $env.REPLY_API_KEY fallback with empty string
      // The API key should come from ClickUp custom field
      if (code.includes('|| $env.REPLY_API_KEY')) {
        code = code.replace(
          /\|\| \$env\.REPLY_API_KEY/g,
          "|| ''"
        );
        fileChanges++;
      }
      
      // Replace $env.CLICKUP_API_KEY references
      // These are in `this.helpers.request()` calls - we need to pass the key through workflow data
      // For now, mark them so we can identify them
      if (code.includes('$env.CLICKUP_API_KEY')) {
        // In error logging, just hide the key
        code = code.replace(
          /\(\$env\.CLICKUP_API_KEY\)\.slice\(-8\)/g,
          "'********'"
        );
        fileChanges++;
      }
      
      node.parameters.jsCode = code;
    }
  });
  
  if (fileChanges > 0) {
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    console.log(`✅ ${file}: ${fileChanges} changes`);
    totalChanges += fileChanges;
  }
});

console.log(`\n✅ Total changes: ${totalChanges}`);

// Now check remaining $env references
console.log('\n📋 Remaining $env references in Code nodes:');
files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  workflow.nodes.forEach(node => {
    if (node.parameters?.jsCode && node.parameters.jsCode.includes('$env.')) {
      const matches = node.parameters.jsCode.match(/\$env\.[A-Z_]+/g);
      if (matches) {
        console.log(`  ${file} / ${node.name}: ${[...new Set(matches)].join(', ')}`);
      }
    }
  });
});
