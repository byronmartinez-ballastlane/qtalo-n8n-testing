#!/usr/bin/env node

/**
 * Sanitize Workflows - Remove Hardcoded API Keys
 * 
 * This script updates all workflow JSON files to:
 * 1. HTTP Request nodes → Use credential references (httpHeaderAuth)
 * 2. Code nodes → Use $env.CLICKUP_API_KEY and $env.REPLY_API_KEY
 * 
 * Run this before committing to git to ensure no secrets are exposed.
 */

const fs = require('fs');
const path = require('path');

// Hardcoded values to remove
const CLICKUP_API_KEY = '_1GNNPQ7J2RN4UF5TIU5LAB2RJIYW5T2P';
const REPLY_API_KEY = '

const WORKFLOW_DIR = path.join(__dirname, '..', 'workflows');

let totalChanges = 0;

function sanitizeHttpRequestNode(node, workflowName) {
  if (node.type !== 'n8n-nodes-base.httpRequest') return node;
  
  const params = node.parameters || {};
  const url = params.url || '';
  const headers = params.headerParameters?.parameters || [];
  
  // Check if this is a Reply.io API call
  const hasReplyHeader = headers.some(h => 
    h.name?.toLowerCase() === 'x-api-key' && 
    (h.value === REPLY_API_KEY || h.value?.includes('vljMqVej'))
  );
  const isReplyApi = url.includes('reply.io') || hasReplyHeader;
  
  // Check if this is a ClickUp API call  
  const hasClickUpHeader = headers.some(h => 
    h.name?.toLowerCase() === 'authorization' && 
    (h.value === CLICKUP_API_KEY || h.value?.includes('pk_'))
  );
  const isClickUpApi = url.includes('clickup.com') || hasClickUpHeader;
  
  if (isReplyApi && hasReplyHeader) {
    // Remove x-api-key header, keep other headers (like Content-Type)
    const newHeaders = headers.filter(h => 
      h.name?.toLowerCase() !== 'x-api-key'
    );
    
    // Update node to use credential authentication
    node.parameters.authentication = 'genericCredentialType';
    node.parameters.genericAuthType = 'httpHeaderAuth';
    
    if (newHeaders.length > 0) {
      node.parameters.headerParameters = { parameters: newHeaders };
      node.parameters.sendHeaders = true;
    } else {
      delete node.parameters.headerParameters;
      node.parameters.sendHeaders = false;
    }
    
    // Add credential reference (will be linked by deploy script)
    node.credentials = {
      httpHeaderAuth: {
        id: '{{REPLY_CREDENTIAL_ID}}',
        name: 'Reply.io API'
      }
    };
    
    console.log(`  ✅ ${node.name} → Reply.io credential`);
    totalChanges++;
  }
  
  if (isClickUpApi && hasClickUpHeader) {
    // Remove Authorization header, keep other headers
    const newHeaders = headers.filter(h => 
      h.name?.toLowerCase() !== 'authorization'
    );
    
    // Update node to use credential authentication
    node.parameters.authentication = 'genericCredentialType';
    node.parameters.genericAuthType = 'httpHeaderAuth';
    
    if (newHeaders.length > 0) {
      node.parameters.headerParameters = { parameters: newHeaders };
      node.parameters.sendHeaders = true;
    } else {
      delete node.parameters.headerParameters;
      node.parameters.sendHeaders = false;
    }
    
    // Add credential reference (will be linked by deploy script)
    node.credentials = {
      httpHeaderAuth: {
        id: '{{CLICKUP_CREDENTIAL_ID}}', 
        name: 'ClickUp API'
      }
    };
    
    console.log(`  ✅ ${node.name} → ClickUp credential`);
    totalChanges++;
  }
  
  return node;
}

function sanitizeCodeNode(node, workflowName) {
  if (node.type !== 'n8n-nodes-base.code') return node;
  
  let jsCode = node.parameters?.jsCode || '';
  let modified = false;
  
  // Replace hardcoded ClickUp API key with $env reference
  if (jsCode.includes(CLICKUP_API_KEY)) {
    // Handle various string quote styles
    jsCode = jsCode.replace(new RegExp(`'${CLICKUP_API_KEY}'`, 'g'), '$env.CLICKUP_API_KEY');
    jsCode = jsCode.replace(new RegExp(`"${CLICKUP_API_KEY}"`, 'g'), '$env.CLICKUP_API_KEY');
    jsCode = jsCode.replace(new RegExp(`\`${CLICKUP_API_KEY}\``, 'g'), '${$env.CLICKUP_API_KEY}');
    modified = true;
    console.log(`  ✅ ${node.name} → $env.CLICKUP_API_KEY`);
    totalChanges++;
  }
  
  // Replace hardcoded Reply.io API key with $env reference
  if (jsCode.includes(REPLY_API_KEY)) {
    jsCode = jsCode.replace(new RegExp(`'${REPLY_API_KEY}'`, 'g'), '$env.REPLY_API_KEY');
    jsCode = jsCode.replace(new RegExp(`"${REPLY_API_KEY}"`, 'g'), '$env.REPLY_API_KEY');
    jsCode = jsCode.replace(new RegExp(`\`${REPLY_API_KEY}\``, 'g'), '${$env.REPLY_API_KEY}');
    modified = true;
    console.log(`  ✅ ${node.name} → $env.REPLY_API_KEY`);
    totalChanges++;
  }
  
  // Also update any hardcoded .slice(-8) references that expose partial keys
  // Replace patterns like ${'pk_...'.slice(-8)} with $env reference
  if (jsCode.includes("slice(-8)")) {
    // Fix the patterns where we're showing last 8 chars of the key
    jsCode = jsCode.replace(
      /\$\{.*?'pk_[^']*'\.slice\(-8\)\}/g,
      '${$env.CLICKUP_API_KEY.slice(-8)}'
    );
    jsCode = jsCode.replace(
      /\$\{.*?"pk_[^"]*"\.slice\(-8\)\}/g,
      '${$env.CLICKUP_API_KEY.slice(-8)}'
    );
    jsCode = jsCode.replace(
      /\$\{.*?'vljMqVej[^']*'\.slice\(-8\)\}/g,
      '${$env.REPLY_API_KEY.slice(-8)}'
    );
    jsCode = jsCode.replace(
      /\$\{.*?"vljMqVej[^"]*"\.slice\(-8\)\}/g,
      '${$env.REPLY_API_KEY.slice(-8)}'
    );
    // Also handle the parenthesized version
    jsCode = jsCode.replace(
      /\$\{\('pk_[^']*'\)\.slice\(-8\)\}/g,
      '${$env.CLICKUP_API_KEY.slice(-8)}'
    );
  }
  
  if (modified) {
    node.parameters.jsCode = jsCode;
  }
  
  return node;
}

function sanitizeWorkflow(filePath) {
  const filename = path.basename(filePath);
  console.log(`\n📦 ${filename}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = JSON.parse(content);
  
  // Process all nodes
  workflow.nodes = workflow.nodes.map(node => {
    node = sanitizeHttpRequestNode(node, workflow.name);
    node = sanitizeCodeNode(node, workflow.name);
    return node;
  });
  
  // Write back with pretty formatting
  fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
}

function main() {
  console.log('🔧 Sanitizing Workflows - Removing Hardcoded API Keys\n');
  console.log('HTTP Request nodes → Credential references');
  console.log('Code nodes → $env.CLICKUP_API_KEY / $env.REPLY_API_KEY\n');
  console.log('=' .repeat(60));
  
  // Get all workflow files
  const files = fs.readdirSync(WORKFLOW_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(WORKFLOW_DIR, f));
  
  for (const file of files) {
    sanitizeWorkflow(file);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Sanitization complete! ${totalChanges} changes made.`);
  console.log('\n📋 Next steps:');
  console.log('  1. Review the changes with: git diff workflows/');
  console.log('  2. Commit: git add workflows/ && git commit -m "Remove hardcoded API keys"');
  console.log('  3. Deploy: node scripts/deploy-professional.js');
  console.log('     → Credentials will be created and linked automatically');
  console.log('     → $env variables will be available in Code nodes');
}

main();
