#!/usr/bin/env node
/**
 * Deploy Client Workflows
 * 
 * This script is called by GitHub Actions to deploy workflows for a client.
 * It reads templates from the repo, injects client credentials, and creates workflows in n8n.
 * 
 * Environment Variables:
 *   N8N_API_URL - n8n Cloud API URL
 *   N8N_API_KEY - n8n API key
 *   AWS_API_URL - AWS API Gateway URL for client data
 * 
 * Arguments:
 *   --client=<client_id>  - Deploy for specific client
 *   --callback=<url>      - Optional callback URL after completion
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const N8N_API_URL = process.env.N8N_API_URL || 'https://qtalospace.app.n8n.cloud/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;
const AWS_API_URL = process.env.AWS_API_URL || 'https://vk6ueupecj.execute-api.us-east-1.amazonaws.com/prod';
const PROJECT_ID = process.env.N8N_PROJECT_ID || 'BFIDAvXOISVZh7tb';

// Template mapping
const TEMPLATES = [
  { file: 'phase1-import-hygiene.template.json', key: 'phase1', name: 'Phase 1: Import & Hygiene' },
  { file: 'phase2-signatures.template.json', key: 'phase2', name: 'Phase 2: Signatures' },
  { file: 'phase3-standardize.template.json', key: 'phase3', name: 'Phase 3: Standardize' },
  { file: 'main-orchestrator.template.json', key: 'orchestrator', name: 'Main Orchestrator' }
];

// n8n API client
const n8nApi = axios.create({
  baseURL: N8N_API_URL,
  headers: { 'X-N8N-API-KEY': N8N_API_KEY }
});

// AWS API client
const awsApi = axios.create({
  baseURL: AWS_API_URL
});

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  
  for (const arg of args) {
    if (arg.startsWith('--client=')) {
      config.clientId = arg.split('=')[1];
    } else if (arg.startsWith('--callback=')) {
      config.callbackUrl = arg.split('=')[1];
    } else if (arg.startsWith('--clickup-task=')) {
      config.clickupTaskId = arg.split('=')[1];
    }
  }
  
  return config;
}

/**
 * Fetch client data from AWS API
 */
async function fetchClientData(clientId) {
  console.log(`📡 Fetching client data for: ${clientId}`);
  
  try {
    const response = await awsApi.get(`/clients/${clientId}`);
    const client = response.data;
    
    console.log(`✅ Found client: ${client.client_name}`);
    return client;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Client not found: ${clientId}`);
    }
    throw new Error(`Failed to fetch client: ${error.message}`);
  }
}

/**
 * Fetch client secrets from AWS API
 */
async function fetchClientSecrets(clientId) {
  console.log(`🔐 Fetching client secrets...`);
  
  try {
    const response = await awsApi.get(`/clients/${clientId}/credentials`);
    return response.data;
  } catch (error) {
    console.warn(`⚠️ Could not fetch secrets: ${error.message}`);
    return {};
  }
}

/**
 * Create or update an n8n credential
 */
async function ensureCredential(name, type, data) {
  try {
    // List existing credentials
    const response = await n8nApi.get('/credentials');
    const existing = response.data.data?.find(c => c.name === name);
    
    if (existing) {
      // Update existing
      await n8nApi.patch(`/credentials/${existing.id}`, { data });
      console.log(`✅ Updated credential: ${name} (ID: ${existing.id})`);
      return existing.id;
    } else {
      // Create new
      const createResponse = await n8nApi.post('/credentials', { name, type, data });
      const newId = createResponse.data.id;
      console.log(`✅ Created credential: ${name} (ID: ${newId})`);
      return newId;
    }
  } catch (error) {
    console.error(`❌ Failed to create/update credential ${name}:`, error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Create client credentials in n8n
 */
async function createClientCredentials(clientId, clientName, secrets) {
  const credentialIds = {};
  
  // Reply.io API credential (HTTP Header Auth)
  if (secrets.reply_api_key) {
    const replyCredId = await ensureCredential(
      `${clientName}-Reply-API`,
      'httpHeaderAuth',
      {
        name: 'X-API-Key',
        value: secrets.reply_api_key
      }
    );
    if (replyCredId) credentialIds.reply = replyCredId;
  }
  
  // ClickUp API credential (HTTP Header Auth)
  if (secrets.clickup_api_key) {
    const clickupCredId = await ensureCredential(
      `${clientName}-ClickUp-API`,
      'httpHeaderAuth',
      {
        name: 'Authorization',
        value: secrets.clickup_api_key
      }
    );
    if (clickupCredId) credentialIds.clickup = clickupCredId;
  }
  
  return credentialIds;
}

/**
 * Clean workflow nodes for n8n API
 * Removes properties that the API doesn't accept
 */
function cleanWorkflowForApi(workflow) {
  const cleaned = {
    name: workflow.name,
    nodes: workflow.nodes.map(node => {
      const cleanNode = {
        parameters: node.parameters || {},
        name: node.name,
        type: node.type,
        typeVersion: node.typeVersion,
        position: node.position
      };
      
      // Keep ID if it's descriptive (not auto-generated)
      if (node.id && node.id.includes('-')) {
        cleanNode.id = node.id;
      }
      
      // Handle credentials - only include if ID is set
      if (node.credentials) {
        const creds = {};
        for (const [key, value] of Object.entries(node.credentials)) {
          if (value.id && value.id !== '') {
            creds[key] = value;
          }
        }
        if (Object.keys(creds).length > 0) {
          cleanNode.credentials = creds;
        }
      }
      
      return cleanNode;
    }),
    connections: workflow.connections,
    settings: workflow.settings || { executionOrder: 'v1' }
  };
  
  return cleaned;
}

/**
 * Inject client-specific values into workflow
 */
function injectClientValues(workflow, clientId, clientName, credentialIds) {
  const clientIdUpper = clientId.toUpperCase();
  
  // Inject into nodes
  workflow.nodes = workflow.nodes.map(node => {
    // Replace variable references
    if (node.parameters) {
      let params = JSON.stringify(node.parameters);
      params = params.replace(/\{\{CLIENT_ID\}\}/g, clientIdUpper);
      params = params.replace(/\{\{CLIENT_NAME\}\}/g, clientName);
      params = params.replace(/\$vars\.CLIENT_REPLY_API_KEY/g, `$vars.${clientIdUpper}_REPLY_API_KEY`);
      params = params.replace(/\$vars\.CLIENT_CLICKUP_API_KEY/g, `$vars.${clientIdUpper}_CLICKUP_API_KEY`);
      node.parameters = JSON.parse(params);
    }
    
    // Inject credential IDs
    if (node.credentials) {
      for (const [key, value] of Object.entries(node.credentials)) {
        if (value.name?.includes('Reply') && credentialIds.reply) {
          value.id = credentialIds.reply;
        } else if (value.name?.includes('ClickUp') && credentialIds.clickup) {
          value.id = credentialIds.clickup;
        }
        
        // Update credential name to client-specific
        if (value.name?.includes('-Reply-')) {
          value.name = `${clientName}-Reply-API`;
        } else if (value.name?.includes('-ClickUp-')) {
          value.name = `${clientName}-ClickUp-API`;
        }
      }
    }
    
    return node;
  });
  
  return workflow;
}

/**
 * Create or update workflow in n8n
 */
async function deployWorkflow(workflow) {
  try {
    // Check if workflow exists by name
    const listResponse = await n8nApi.get('/workflows');
    const existing = listResponse.data.data?.find(w => w.name === workflow.name);
    
    const cleanedWorkflow = cleanWorkflowForApi(workflow);
    
    if (existing) {
      // Update existing workflow
      await n8nApi.put(`/workflows/${existing.id}`, cleanedWorkflow);
      console.log(`✅ Updated workflow: ${workflow.name} (ID: ${existing.id})`);
      return existing.id;
    } else {
      // Create new workflow
      const createResponse = await n8nApi.post('/workflows', cleanedWorkflow);
      const newId = createResponse.data.id;
      
      // Transfer to project if specified
      if (PROJECT_ID) {
        try {
          await n8nApi.put(`/workflows/${newId}/transfer`, { destinationProjectId: PROJECT_ID });
        } catch (e) {
          // May already be in project or transfer not available
        }
      }
      
      console.log(`✅ Created workflow: ${workflow.name} (ID: ${newId})`);
      return newId;
    }
  } catch (error) {
    console.error(`❌ Failed to deploy workflow ${workflow.name}:`);
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Message: ${error.response?.data?.message || error.message}`);
    
    // Log the request body for debugging
    if (process.env.DEBUG) {
      console.error('   Request body:', JSON.stringify(cleanWorkflowForApi(workflow), null, 2));
    }
    
    return null;
  }
}

/**
 * Update orchestrator with phase workflow IDs
 */
async function linkOrchestratorToPhases(orchestratorId, workflowIds) {
  if (!orchestratorId || !workflowIds.phase1) return;
  
  console.log('🔗 Linking orchestrator to phase workflows...');
  
  try {
    const response = await n8nApi.get(`/workflows/${orchestratorId}`);
    const orchestrator = response.data;
    
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
    
    await n8nApi.put(`/workflows/${orchestratorId}`, orchestrator);
    console.log('✅ Linked orchestrator to phase workflows');
  } catch (error) {
    console.error('⚠️ Failed to link orchestrator:', error.message);
  }
}

/**
 * Activate a workflow
 */
async function activateWorkflow(workflowId) {
  try {
    await n8nApi.post(`/workflows/${workflowId}/activate`);
    console.log(`✅ Activated workflow ID: ${workflowId}`);
    return true;
  } catch (error) {
    console.log(`⚠️ Could not activate workflow ${workflowId} (may already be active)`);
    return false;
  }
}

/**
 * Update client record in AWS API with workflow IDs
 */
async function updateClientWorkflowIds(clientId, workflowIds) {
  console.log('📝 Updating client record with workflow IDs...');
  
  try {
    await awsApi.put(`/clients/${clientId}`, {
      workflow_ids: workflowIds,
      template_version: '2.0.0',
      updated_at: new Date().toISOString()
    });
    console.log('✅ Updated client record in AWS');
  } catch (error) {
    console.error('⚠️ Failed to update client record:', error.message);
  }
}

/**
 * Send callback notification
 */
async function sendCallback(callbackUrl, status, data) {
  if (!callbackUrl) return;
  
  console.log(`📤 Sending callback to: ${callbackUrl}`);
  
  try {
    await axios.post(callbackUrl, {
      status,
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Callback sent successfully');
  } catch (error) {
    console.error('⚠️ Failed to send callback:', error.message);
  }
}

/**
 * Main deployment function
 */
async function deployClientWorkflows(config) {
  const { clientId, callbackUrl, clickupTaskId } = config;
  
  console.log('\n============================================================');
  console.log(`🚀 Deploying workflows for client: ${clientId}`);
  console.log('============================================================\n');
  
  // Validate environment
  if (!N8N_API_KEY) {
    throw new Error('N8N_API_KEY environment variable is required');
  }
  
  // Step 1: Fetch client data
  const clientData = await fetchClientData(clientId);
  const clientName = clientData.client_name || clientId;
  
  // Step 2: Fetch client secrets
  const secrets = await fetchClientSecrets(clientId);
  
  // Step 3: Create credentials in n8n
  console.log('\n🔑 Creating client credentials in n8n...');
  const credentialIds = await createClientCredentials(clientId, clientName, secrets);
  
  // Step 4: Deploy workflows from templates
  console.log('\n📦 Deploying workflows from templates...\n');
  
  const templatesDir = path.join(__dirname, '../templates');
  const workflowIds = {};
  
  for (const template of TEMPLATES) {
    const templatePath = path.join(templatesDir, template.file);
    
    if (!fs.existsSync(templatePath)) {
      console.warn(`⚠️ Template not found: ${template.file}`);
      continue;
    }
    
    // Read and parse template
    const content = fs.readFileSync(templatePath, 'utf8');
    let workflow = JSON.parse(content);
    
    // Update workflow name for client
    workflow.name = `${clientName} - ${template.name}`;
    
    // Inject client-specific values
    workflow = injectClientValues(workflow, clientId, clientName, credentialIds);
    
    // Deploy workflow
    const workflowId = await deployWorkflow(workflow);
    
    if (workflowId) {
      workflowIds[template.key] = workflowId;
    }
  }
  
  // Step 5: Link orchestrator to phase workflows
  if (workflowIds.orchestrator) {
    await linkOrchestratorToPhases(workflowIds.orchestrator, workflowIds);
    
    // Activate orchestrator
    await activateWorkflow(workflowIds.orchestrator);
  }
  
  // Step 6: Update AWS client record
  await updateClientWorkflowIds(clientId, workflowIds);
  
  // Summary
  console.log('\n============================================================');
  console.log('✅ Deployment Complete!');
  console.log('============================================================\n');
  
  console.log('Workflows deployed:');
  for (const [key, id] of Object.entries(workflowIds)) {
    console.log(`  - ${key}: ${id}`);
  }
  
  console.log('\nCredentials created:');
  for (const [key, id] of Object.entries(credentialIds)) {
    console.log(`  - ${key}: ${id}`);
  }
  
  // Send callback if provided
  if (callbackUrl) {
    await sendCallback(callbackUrl, 'success', {
      client_id: clientId,
      client_name: clientName,
      workflow_ids: workflowIds,
      credential_ids: credentialIds,
      clickup_task_id: clickupTaskId
    });
  }
  
  return { workflowIds, credentialIds };
}

// Main execution
const config = parseArgs();

if (!config.clientId) {
  console.error('Usage: node scripts/deploy-client-workflows.js --client=<client_id> [--callback=<url>]');
  process.exit(1);
}

deployClientWorkflows(config)
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Deployment failed:', error.message);
    
    // Send failure callback
    if (config.callbackUrl) {
      sendCallback(config.callbackUrl, 'failure', {
        client_id: config.clientId,
        error: error.message,
        clickup_task_id: config.clickupTaskId
      }).then(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
