#!/usr/bin/env node
/**
 * Simple Client Onboarding Script
 * 
 * Creates per-client variables and workflows in n8n Cloud
 * 
 * Usage: node scripts/onboard-client.js <client_id> <client_name> <reply_api_key> <clickup_api_key>
 * Example: node scripts/onboard-client.js acme "ACME Corp" "reply_key_here" "clickup_key_here"
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const N8N_API_URL = process.env.N8N_API_URL || 'https://qtalospace.app.n8n.cloud/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;
const PROJECT_ID = process.env.N8N_PROJECT_ID || 'BFIDAvXOISVZh7tb';

if (!N8N_API_KEY) {
  console.error('❌ N8N_API_KEY environment variable is required');
  process.exit(1);
}

const api = axios.create({
  baseURL: N8N_API_URL,
  headers: { 'X-N8N-API-KEY': N8N_API_KEY }
});

async function createVariable(key, value) {
  try {
    // Try to create
    await api.post('/variables', { key, value });
    console.log(`✅ Created variable: ${key}`);
    return true;
  } catch (error) {
    if (error.response?.status === 409 || error.response?.data?.message?.includes('exists')) {
      // Already exists, try to update
      try {
        await api.delete(`/variables/${key}`);
        await api.post('/variables', { key, value });
        console.log(`✅ Updated variable: ${key}`);
        return true;
      } catch (e) {
        console.error(`❌ Failed to update variable ${key}:`, e.response?.data?.message || e.message);
        return false;
      }
    }
    console.error(`❌ Failed to create variable ${key}:`, error.response?.data?.message || error.message);
    return false;
  }
}

async function createWorkflow(workflow) {
  try {
    // Check if exists by name
    const existing = await api.get('/workflows');
    const found = existing.data.data?.find(w => w.name === workflow.name);
    
    if (found) {
      // Update existing
      await api.put(`/workflows/${found.id}`, workflow);
      console.log(`✅ Updated workflow: ${workflow.name} (ID: ${found.id})`);
      return found.id;
    } else {
      // Create new
      const response = await api.post('/workflows', workflow);
      const newId = response.data.id;
      
      // Transfer to project
      try {
        await api.put(`/workflows/${newId}/transfer`, { destinationProjectId: PROJECT_ID });
      } catch (e) {
        // May already be in project
      }
      
      console.log(`✅ Created workflow: ${workflow.name} (ID: ${newId})`);
      return newId;
    }
  } catch (error) {
    console.error(`❌ Failed to create workflow ${workflow.name}:`, error.response?.data?.message || error.message);
    return null;
  }
}

async function onboardClient(clientId, clientName, replyApiKey, clickupApiKey) {
  console.log('\n============================================================');
  console.log(`Onboarding Client: ${clientName} (${clientId})`);
  console.log('============================================================\n');
  
  const clientIdUpper = clientId.toUpperCase();
  
  // Step 1: Create variables
  console.log('📋 Creating client variables...\n');
  
  const varsCreated = await Promise.all([
    createVariable(`${clientIdUpper}_REPLY_API_KEY`, replyApiKey),
    createVariable(`${clientIdUpper}_CLICKUP_API_KEY`, clickupApiKey)
  ]);
  
  if (!varsCreated.every(v => v)) {
    console.error('\n❌ Failed to create some variables. Aborting.');
    process.exit(1);
  }
  
  // Step 2: Load and process templates
  console.log('\n📦 Creating client workflows...\n');
  
  const templatesDir = path.join(__dirname, '../templates');
  const templateFiles = [
    'phase1-import-hygiene.template.json',
    'phase2-signatures.template.json',
    'phase3-standardize.template.json',
    'main-orchestrator.template.json'  // Deploy last so we can update workflow IDs
  ];
  
  const workflowIds = {};
  
  for (const templateFile of templateFiles) {
    const templatePath = path.join(templatesDir, templateFile);
    
    if (!fs.existsSync(templatePath)) {
      console.error(`❌ Template not found: ${templatePath}`);
      continue;
    }
    
    let content = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders
    content = content.replace(/\{\{CLIENT_ID\}\}/g, clientIdUpper);
    content = content.replace(/\{\{CLIENT_NAME\}\}/g, clientName);
    
    const workflow = JSON.parse(content);
    
    // Remove IDs so n8n creates new ones
    delete workflow.id;
    workflow.nodes.forEach(node => {
      if (node.id && !node.id.includes('-')) {
        // Keep descriptive IDs, remove auto-generated ones
      }
    });
    
    const workflowId = await createWorkflow(workflow);
    
    if (workflowId) {
      // Track workflow IDs for linking
      if (templateFile.includes('phase1')) workflowIds.phase1 = workflowId;
      if (templateFile.includes('phase2')) workflowIds.phase2 = workflowId;
      if (templateFile.includes('phase3')) workflowIds.phase3 = workflowId;
      if (templateFile.includes('orchestrator')) workflowIds.orchestrator = workflowId;
    }
  }
  
  // Step 3: Update orchestrator with phase workflow IDs
  if (workflowIds.orchestrator && workflowIds.phase1) {
    console.log('\n🔗 Linking workflow IDs in orchestrator...');
    
    try {
      const orchResponse = await api.get(`/workflows/${workflowIds.orchestrator}`);
      const orchestrator = orchResponse.data;
      
      orchestrator.nodes.forEach(node => {
        if (node.type === 'n8n-nodes-base.executeWorkflow') {
          if (node.name.includes('Phase 1') && workflowIds.phase1) {
            node.parameters.workflowId = workflowIds.phase1;
          }
          if (node.name.includes('Phase 2') && workflowIds.phase2) {
            node.parameters.workflowId = workflowIds.phase2;
          }
          if (node.name.includes('Phase 3') && workflowIds.phase3) {
            node.parameters.workflowId = workflowIds.phase3;
          }
        }
      });
      
      await api.put(`/workflows/${workflowIds.orchestrator}`, orchestrator);
      console.log('✅ Updated orchestrator with phase workflow IDs');
    } catch (error) {
      console.error('⚠️ Failed to update orchestrator workflow IDs:', error.message);
    }
  }
  
  // Step 4: Activate orchestrator
  if (workflowIds.orchestrator) {
    try {
      await api.post(`/workflows/${workflowIds.orchestrator}/activate`);
      console.log(`✅ Activated orchestrator workflow`);
    } catch (e) {
      console.log(`⚠️ Could not activate orchestrator (may already be active)`);
    }
  }
  
  // Summary
  console.log('\n============================================================');
  console.log('✅ Client Onboarding Complete!');
  console.log('============================================================\n');
  
  console.log('Variables created:');
  console.log(`  - $vars.${clientIdUpper}_REPLY_API_KEY`);
  console.log(`  - $vars.${clientIdUpper}_CLICKUP_API_KEY`);
  
  console.log('\nWorkflows created:');
  if (workflowIds.orchestrator) console.log(`  - ${clientName} - Main Orchestrator (ID: ${workflowIds.orchestrator})`);
  if (workflowIds.phase1) console.log(`  - ${clientName} - Phase 1 (ID: ${workflowIds.phase1})`);
  if (workflowIds.phase2) console.log(`  - ${clientName} - Phase 2 (ID: ${workflowIds.phase2})`);
  if (workflowIds.phase3) console.log(`  - ${clientName} - Phase 3 (ID: ${workflowIds.phase3})`);
  
  console.log('\nWebhook URL:');
  console.log(`  POST https://qtalospace.app.n8n.cloud/webhook/clickup-reply-setup`);
  console.log(`  Body: { "task_id": "your_clickup_task_id" }`);
  
  // Save client config
  const clientsDir = path.join(__dirname, '../clients', clientId);
  fs.mkdirSync(clientsDir, { recursive: true });
  fs.writeFileSync(path.join(clientsDir, 'config.json'), JSON.stringify({
    client_id: clientId,
    client_name: clientName,
    variables: {
      reply_api_key: `${clientIdUpper}_REPLY_API_KEY`,
      clickup_api_key: `${clientIdUpper}_CLICKUP_API_KEY`
    },
    workflow_ids: workflowIds,
    created_at: new Date().toISOString()
  }, null, 2));
  
  console.log(`\nClient config saved to: clients/${clientId}/config.json`);
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length < 4) {
  console.log('Usage: node scripts/onboard-client.js <client_id> <client_name> <reply_api_key> <clickup_api_key>');
  console.log('Example: node scripts/onboard-client.js acme "ACME Corp" "reply_key_here" "clickup_key_here"');
  process.exit(1);
}

const [clientId, clientName, replyApiKey, clickupApiKey] = args;

onboardClient(clientId, clientName, replyApiKey, clickupApiKey).catch(error => {
  console.error('❌ Onboarding failed:', error.message);
  process.exit(1);
});
