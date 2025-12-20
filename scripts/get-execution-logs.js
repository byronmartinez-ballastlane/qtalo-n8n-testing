#!/usr/bin/env node

const http = require('http');

const N8N_URL = 'http://localhost:5678';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, N8N_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getLatestExecution(workflowName) {
  try {
    console.log(`\n🔍 Fetching latest execution for: ${workflowName}\n`);
    
    // Get recent executions
    const executions = await makeRequest('/api/v1/executions?limit=5');
    
    if (!executions.data || executions.data.length === 0) {
      console.log('❌ No executions found');
      return;
    }
    
    // Find execution for the workflow
    const targetExec = executions.data.find(e => 
      e.workflowData?.name === workflowName
    ) || executions.data[0];
    
    console.log(`📊 Execution ID: ${targetExec.id}`);
    console.log(`⏱️  Start: ${new Date(targetExec.startedAt).toLocaleString()}`);
    console.log(`✓ Finished: ${targetExec.finished}`);
    console.log(`📈 Status: ${targetExec.status}\n`);
    
    // Get detailed execution data
    const details = await makeRequest(`/api/v1/executions/${targetExec.id}`);
    
    console.log('='.repeat(80));
    console.log('NODE EXECUTION DETAILS');
    console.log('='.repeat(80));
    
    const nodeData = details.data?.resultData?.runData || {};
    
    for (const [nodeName, runs] of Object.entries(nodeData)) {
      console.log(`\n📦 Node: ${nodeName}`);
      
      if (!runs || runs.length === 0) {
        console.log('   No data');
        continue;
      }
      
      const run = runs[0];
      
      if (run.error) {
        console.log(`   ❌ ERROR: ${run.error.message}`);
        if (run.error.description) {
          console.log(`   Details: ${run.error.description}`);
        }
        continue;
      }
      
      if (run.data?.main && run.data.main[0]) {
        const items = run.data.main[0];
        console.log(`   ✓ Success: ${items.length} item(s)`);
        
        // Show first item data (keys only to avoid too much output)
        if (items[0]?.json) {
          const keys = Object.keys(items[0].json);
          console.log(`   Keys: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`);
          
          // Show specific important fields
          const json = items[0].json;
          if (json.csv_attachment_url) {
            console.log(`   CSV URL: ${json.csv_attachment_url}`);
          }
          if (json.data !== undefined) {
            console.log(`   Has 'data' field: ${typeof json.data === 'string' ? `${json.data.length} chars` : typeof json.data}`);
          }
          if (json.mailbox_csv_content !== undefined) {
            console.log(`   Has 'mailbox_csv_content': ${typeof json.mailbox_csv_content === 'string' ? `${json.mailbox_csv_content.length} chars` : typeof json.mailbox_csv_content}`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run
const workflowName = process.argv[2] || 'Qtalo - Main Orchestrator';
getLatestExecution(workflowName);
