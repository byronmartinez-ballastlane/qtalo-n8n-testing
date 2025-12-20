#!/usr/bin/env node
/**
 * Local Client Onboarding Script
 * Creates per-client credentials and deploys workflows from local templates
 * 
 * Usage: node scripts/onboard-client-local.js <client_id> <client_name> <reply_api_key> <clickup_api_key>
 * 
 * Example: node scripts/onboard-client-local.js qtalo "Qtalo" "$REPLY_API_KEY" "$CLICKUP_API_KEY"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const N8N_BASE_URL = 'https://qtalospace.app.n8n.cloud';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error('❌ N8N_API_KEY environment variable is required');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Usage: node scripts/onboard-client-local.js <client_id> <client_name> <reply_api_key> <clickup_api_key>');
  console.log('Example: node scripts/onboard-client-local.js qtalo "Qtalo" "$REPLY_API_KEY" "$CLICKUP_API_KEY"');
  process.exit(1);
}

const [clientId, clientName, replyApiKey, clickupApiKey] = args;

console.log(`\n🚀 Onboarding client: ${clientName} (${clientId})\n`);

// API helper
function apiRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, N8N_BASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const credentialIds = {};
  const workflowIds = {};

  // Step 1: Create ClickUp credential
  console.log('📦 Creating ClickUp credential...');
  const clickupCredName = `${clientName}-ClickUp-API`;
  
  // Check if exists
  const existingCreds = await apiRequest('GET', '/api/v1/credentials');
  const existingClickup = existingCreds.data?.data?.find(c => c.name === clickupCredName);
  
  if (existingClickup) {
    credentialIds.clickup = existingClickup.id;
    console.log(`   ✅ Found existing: ${clickupCredName} (${credentialIds.clickup})`);
  } else {
    const clickupCred = await apiRequest('POST', '/api/v1/credentials', {
      name: clickupCredName,
      type: 'httpHeaderAuth',
      data: {
        name: 'Authorization',
        value: clickupApiKey
      }
    });
    if (clickupCred.status === 200 || clickupCred.status === 201) {
      credentialIds.clickup = clickupCred.data.id;
      console.log(`   ✅ Created: ${clickupCredName} (${credentialIds.clickup})`);
    } else {
      console.log(`   ❌ Failed to create ClickUp credential:`, clickupCred.data);
    }
  }

  // Step 2: Create Reply credential
  console.log('📦 Creating Reply.io credential...');
  const replyCredName = `${clientName}-Reply-API`;
  
  const existingReply = existingCreds.data?.data?.find(c => c.name === replyCredName);
  
  if (existingReply) {
    credentialIds.reply = existingReply.id;
    console.log(`   ✅ Found existing: ${replyCredName} (${credentialIds.reply})`);
  } else {
    const replyCred = await apiRequest('POST', '/api/v1/credentials', {
      name: replyCredName,
      type: 'httpHeaderAuth',
      data: {
        name: 'X-Api-Key',
        value: replyApiKey
      }
    });
    if (replyCred.status === 200 || replyCred.status === 201) {
      credentialIds.reply = replyCred.data.id;
      console.log(`   ✅ Created: ${replyCredName} (${credentialIds.reply})`);
    } else {
      console.log(`   ❌ Failed to create Reply credential:`, replyCred.data);
    }
  }

  // Step 3: Load and process templates
  const templatesDir = path.join(__dirname, '..', 'templates');
  const templates = [
    { file: 'phase1-import-hygiene.template.json', key: 'phase1-import-hygiene', display: 'Phase 1: Import & Hygiene' },
    { file: 'phase2-signatures.template.json', key: 'phase2-signatures', display: 'Phase 2: Signatures & Opt-Outs' },
    { file: 'phase3-standardize.template.json', key: 'phase3-standardize', display: 'Phase 3: Standardize Workspace' },
    { file: 'main-orchestrator.template.json', key: 'main-orchestrator', display: 'Main Orchestrator' }
  ];

  console.log('\n📄 Processing templates...');

  for (const template of templates) {
    const templatePath = path.join(templatesDir, template.file);
    
    if (!fs.existsSync(templatePath)) {
      console.log(`   ⚠️ Template not found: ${template.file}`);
      continue;
    }

    let templateContent = fs.readFileSync(templatePath, 'utf8');

    // Replace all placeholders
    templateContent = templateContent
      .replace(/\{\{CLICKUP_CREDENTIAL_ID\}\}/g, credentialIds.clickup || '')
      .replace(/\{\{REPLY_CREDENTIAL_ID\}\}/g, credentialIds.reply || '')
      .replace(/\{\{CLICKUP_CREDENTIAL_NAME\}\}/g, clickupCredName)
      .replace(/\{\{REPLY_CREDENTIAL_NAME\}\}/g, replyCredName)
      .replace(/\{\{CLIENT_NAME\}\}/g, clientName)
      .replace(/\{\{CLIENT_ID\}\}/g, clientId.toUpperCase().replace(/-/g, '_'))
      .replace(/HARDCODED_CLICKUP_API_KEY/g, clickupApiKey)
      .replace(/HARDCODED_REPLY_API_KEY/g, replyApiKey);

    const rawWorkflow = JSON.parse(templateContent);
    
    // n8n API only accepts specific fields - extract only what's needed
    const workflow = {
      name: `${clientName} - ${template.display}`,
      nodes: rawWorkflow.nodes,
      connections: rawWorkflow.connections,
      settings: rawWorkflow.settings || {},
      staticData: rawWorkflow.staticData || null,
      pinData: rawWorkflow.pinData || {}
    };

    // Check if workflow exists
    const existingWorkflows = await apiRequest('GET', '/api/v1/workflows');
    const existing = existingWorkflows.data?.data?.find(w => w.name === workflow.name);

    let result;
    if (existing) {
      // Update existing
      result = await apiRequest('PUT', `/api/v1/workflows/${existing.id}`, workflow);
      if (result.status === 200) {
        workflowIds[template.key] = existing.id;
        console.log(`   ✅ Updated: ${workflow.name} (${existing.id})`);
      } else {
        console.log(`   ❌ Failed to update ${workflow.name}:`, JSON.stringify(result.data, null, 2));
      }
    } else {
      // Create new
      result = await apiRequest('POST', '/api/v1/workflows', workflow);
      if (result.status === 200 || result.status === 201) {
        workflowIds[template.key] = result.data.id;
        console.log(`   ✅ Created: ${workflow.name} (${result.data.id})`);
      } else {
        console.log(`   ❌ Failed to create ${workflow.name}:`);
        console.log(`      Status: ${result.status}`);
        console.log(`      Error: ${JSON.stringify(result.data, null, 2)}`);
      }
    }
  }

  // Step 4: Activate main orchestrator
  if (workflowIds['main-orchestrator']) {
    console.log('\n⚡ Activating main orchestrator...');
    const activateResult = await apiRequest('PATCH', `/api/v1/workflows/${workflowIds['main-orchestrator']}`, {
      active: true
    });
    if (activateResult.status === 200) {
      console.log(`   ✅ Activated: ${clientName} - Main Orchestrator`);
    } else {
      console.log(`   ⚠️ Could not activate (may need manual activation)`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ONBOARDING COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nClient: ${clientName} (${clientId})`);
  console.log('\nCredentials created:');
  console.log(`  - ${clickupCredName}: ${credentialIds.clickup || '❌ failed'}`);
  console.log(`  - ${replyCredName}: ${credentialIds.reply || '❌ failed'}`);
  console.log('\nWorkflows deployed:');
  for (const [key, id] of Object.entries(workflowIds)) {
    console.log(`  - ${key}: ${id}`);
  }
  
  if (workflowIds['main-orchestrator']) {
    console.log(`\n🎯 Webhook URL:`);
    console.log(`   https://qtalospace.app.n8n.cloud/webhook/${clientName}-clickup-reply-setup`);
  }
  
  console.log('\n✨ Done!\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
