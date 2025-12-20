#!/usr/bin/env node
/**
 * Fix Code nodes to use _credentials from workflow data instead of $env
 * n8n Cloud blocks $env access in Code nodes, but Set nodes can read $env via expressions
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '../workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

let totalChanges = 0;

files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace $env.CLICKUP_API_KEY in Code nodes with reference to _credentials
  // The pattern: $env.CLICKUP_API_KEY -> $('Load Credentials').first().json._credentials?.clickup_api_key || $input.first().json._credentials?.clickup_api_key
  
  let changes = 0;
  
  // Simple replacement for Code node jsCode strings
  // In orchestrator, use Load Credentials node
  // In phase workflows, credentials come from Start node's inputData
  
  if (file === 'main-orchestrator.json') {
    // Orchestrator: get from Load Credentials node
    const oldPattern = /\$env\.CLICKUP_API_KEY/g;
    const newValue = "$('Load Credentials').first().json._credentials?.clickup_api_key";
    
    const oldReplyPattern = /\$env\.REPLY_API_KEY/g;
    const newReplyValue = "$('Load Credentials').first().json._credentials?.reply_api_key";
    
    const before = content;
    content = content.replace(oldPattern, newValue);
    content = content.replace(oldReplyPattern, newReplyValue);
    
    if (content !== before) {
      changes++;
    }
  } else {
    // Phase workflows: get from Start node's inputData or direct json
    // First, let's see what structure we have
    const oldClickupPattern = /\$env\.CLICKUP_API_KEY/g;
    const newClickupValue = "($('Start').first().json._credentials?.clickup_api_key || (JSON.parse($('Start').first().json.inputData || '{}')._credentials?.clickup_api_key))";
    
    const oldReplyPattern = /\$env\.REPLY_API_KEY/g;  
    const newReplyValue = "($('Start').first().json._credentials?.reply_api_key || (JSON.parse($('Start').first().json.inputData || '{}')._credentials?.reply_api_key) || $('Start').first().json.reply_api_key)";
    
    const before = content;
    content = content.replace(oldClickupPattern, newClickupValue);
    content = content.replace(oldReplyPattern, newReplyValue);
    
    if (content !== before) {
      changes++;
    }
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${file}: updated`);
    totalChanges += changes;
  }
});

console.log(`\n✅ Updated ${totalChanges} files`);

// Verify no $env references remain in jsCode
console.log('\n📋 Checking for remaining $env in Code nodes...');
files.forEach(file => {
  const filePath = path.join(workflowsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = JSON.parse(content);
  
  workflow.nodes.forEach(node => {
    if (node.parameters?.jsCode && node.parameters.jsCode.includes('$env.')) {
      const matches = node.parameters.jsCode.match(/\$env\.[A-Z_]+/g);
      if (matches) {
        console.log(`  ⚠️ ${file} / ${node.name}: ${[...new Set(matches)].join(', ')}`);
      }
    }
  });
});
