#!/usr/bin/env node

/**
 * Professional n8n Workflow Deployment System
 * - Deploys workflows via REST API
 * - Sets up credentials (ClickUp, Reply.io)
 * - Structured logging with log levels
 */

const fs = require('fs');
const axios = require('axios');
const path = require('path');

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  constructor(level = 'info') {
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    this.level = this.levels[level] || this.levels.info;
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  _log(level, icon, color, message, ...args) {
    if (this.levels[level] >= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `${this.colors[color]}${icon}${this.colors.reset}`;
      console.log(`${prefix} ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    this._log('debug', '🔍', 'cyan', message, ...args);
  }

  info(message, ...args) {
    this._log('info', 'ℹ️ ', 'blue', message, ...args);
  }

  success(message, ...args) {
    this._log('info', '✅', 'green', message, ...args);
  }

  warn(message, ...args) {
    this._log('warn', '⚠️ ', 'yellow', message, ...args);
  }

  error(message, ...args) {
    this._log('error', '❌', 'red', message, ...args);
  }

  section(title) {
    const separator = '='.repeat(60);
    console.log(`\n${this.colors.bright}${separator}${this.colors.reset}`);
    console.log(`${this.colors.bright}${title}${this.colors.reset}`);
    console.log(`${this.colors.bright}${separator}${this.colors.reset}\n`);
  }

  workflow(name, nodeCount) {
    console.log(`\n📦 ${this.colors.bright}${name}${this.colors.reset}`);
    console.log(`   Nodes: ${nodeCount}`);
  }
}

// ============================================================================
// N8N Deployment Manager
// ============================================================================

class N8nDeploymentManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'X-N8N-API-KEY': config.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    this.results = {
      workflows: [],
      credentials: []
    };
    
    this.clickupCredentialId = null;
    this.replyCredentialId = null;
  }

  // ==========================================================================
  // Connection Testing
  // ==========================================================================

  async testConnection() {
    this.logger.info('Testing connection to n8n...');
    try {
      await this.client.get('/workflows');
      this.logger.success('Connected to n8n successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to n8n');
      this.logger.error(`Error: ${error.message}`);
      if (error.response?.status === 401) {
        this.logger.error('Invalid API key. Please check N8N_API_KEY environment variable');
      }
      return false;
    }
  }

  // ==========================================================================
  // Credential Management
  // ==========================================================================

  async getExistingCredentials() {
    try {
      const response = await this.client.get('/credentials');
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Failed to get existing credentials:', error.message);
      return [];
    }
  }

  async createOrUpdateCredential(credentialData) {
    const existing = await this.getExistingCredentials();
    const existingCred = existing.find(c => c.name === credentialData.name);

    try {
      if (existingCred) {
        this.logger.info(`Updating credential: ${credentialData.name}`);
        const response = await this.client.patch(`/credentials/${existingCred.id}`, credentialData);
        this.logger.success(`Updated: ${credentialData.name}`);
        return { success: true, id: response.data.id, name: credentialData.name };
      } else {
        this.logger.info(`Creating credential: ${credentialData.name}`);
        const response = await this.client.post('/credentials', credentialData);
        this.logger.success(`Created: ${credentialData.name} (ID: ${response.data.id})`);
        return { success: true, id: response.data.id, name: credentialData.name };
      }
    } catch (error) {
      this.logger.error(`Failed to setup credential: ${credentialData.name}`);
      this.logger.error(`Error: ${error.response?.data?.message || error.message}`);
      return { success: false, name: credentialData.name, error: error.message };
    }
  }

  async setupCredentials() {
    this.logger.section('Setting Up Credentials');

    const credentials = [];

    // ClickUp Credential (for HTTP Request nodes using Authorization header)
    if (this.config.clickupApiKey) {
      credentials.push({
        name: 'ClickUp API',
        type: 'httpHeaderAuth',
        data: {
          name: 'Authorization',
          value: this.config.clickupApiKey
        }
      });
    } else {
      this.logger.warn('CLICKUP_API_KEY not provided - skipping ClickUp credential');
    }

    // Reply.io Credential (for HTTP Request nodes using X-Api-Key header)
    if (this.config.replyApiKey) {
      credentials.push({
        name: 'Reply.io API',
        type: 'httpHeaderAuth',
        data: {
          name: 'X-Api-Key',
          value: this.config.replyApiKey
        }
      });
    } else {
      this.logger.warn('REPLY_API_KEY not provided - skipping Reply.io credential');
    }

    if (credentials.length === 0) {
      this.logger.warn('No credentials to setup - you will need to configure them manually in n8n');
      return;
    }

    for (const cred of credentials) {
      const result = await this.createOrUpdateCredential(cred);
      this.results.credentials.push(result);
      
      // Transfer credential to project if projectId is configured
      if (result.success && this.config.projectId) {
        await this.transferCredential(result.id, result.name);
      }
      
      // Store credential IDs for node linking
      if (result.success) {
        if (cred.name === 'ClickUp API') {
          this.clickupCredentialId = result.id;
          this.logger.debug(`Saved ClickUp credential ID: ${this.clickupCredentialId}`);
        } else if (cred.name === 'Reply.io API') {
          this.replyCredentialId = result.id;
          this.logger.debug(`Saved Reply.io credential ID: ${this.replyCredentialId}`);
        }
      }
    }

    const successful = this.results.credentials.filter(c => c.success).length;
    this.logger.info(`Credentials setup complete: ${successful}/${credentials.length} successful`);
  }

  // ==========================================================================
  // Environment Variables Management
  // ==========================================================================

  async getExistingVariables() {
    try {
      const response = await this.client.get('/variables');
      return response.data.data || [];
    } catch (error) {
      if (error.response?.data?.message?.includes('license does not allow')) {
        this.logger.warn('n8n variables feature not available on current license');
        return null; // Signal that feature is not available
      }
      this.logger.error('Failed to get existing variables:', error.message);
      return [];
    }
  }

  async createOrUpdateVariable(key, value) {
    const existing = await this.getExistingVariables();
    
    // Feature not available
    if (existing === null) {
      return { success: false, key, error: 'Variables feature not available' };
    }

    // Check if variable exists in target project (if projectId configured)
    const existingVar = existing.find(v => {
      if (v.key !== key) return false;
      // If we have a projectId, only match variables in that project
      if (this.config.projectId) {
        return v.project?.id === this.config.projectId;
      }
      return true;
    });

    try {
      if (existingVar) {
        // n8n Cloud doesn't support PATCH for variables, so delete and recreate
        this.logger.info(`Updating variable: ${key} (delete + recreate)`);
        await this.client.delete(`/variables/${existingVar.id}`);
        const payload = { key, value };
        if (this.config.projectId) {
          payload.projectId = this.config.projectId;
        }
        await this.client.post('/variables', payload);
        this.logger.success(`Updated: ${key}`);
        return { success: true, key, action: 'updated' };
      } else {
        this.logger.info(`Creating variable: ${key}`);
        // Include projectId if configured to create in specific project
        const payload = { key, value };
        if (this.config.projectId) {
          payload.projectId = this.config.projectId;
          this.logger.debug(`  → Creating in project: ${this.config.projectId}`);
        }
        await this.client.post('/variables', payload);
        this.logger.success(`Created: ${key}${this.config.projectId ? ' (in project)' : ''}`);
        return { success: true, key, action: 'created' };
      }
    } catch (error) {
      this.logger.error(`Failed to setup variable: ${key}`);
      this.logger.error(`Error: ${error.response?.data?.message || error.message}`);
      return { success: false, key, error: error.message };
    }
  }

  async setupEnvironmentVariables() {
    this.logger.section('Setting Up Environment Variables');

    // Check if variables feature is available
    const existing = await this.getExistingVariables();
    if (existing === null) {
      this.logger.warn('Skipping environment variables - feature not available on current n8n license');
      this.logger.info('Upgrade to n8n Pro/Cloud Pro to use $env variables in workflows');
      return;
    }

    const variables = [];
    const results = [];

    // ClickUp API Key - required for system workflows
    if (this.config.clickupApiKey) {
      variables.push({ key: 'CLICKUP_API_KEY', value: this.config.clickupApiKey });
    } else {
      this.logger.warn('CLICKUP_API_KEY not provided - skipping');
    }

    // Reply.io API Key (optional - for client workflows)
    if (this.config.replyApiKey) {
      variables.push({ key: 'REPLY_API_KEY', value: this.config.replyApiKey });
    }

    if (variables.length === 0) {
      this.logger.warn('No environment variables to setup');
      return;
    }

    this.logger.info(`Setting up ${variables.length} environment variables...`);
    if (this.config.projectId) {
      this.logger.info(`Target project: ${this.config.projectId}`);
    }

    for (const { key, value } of variables) {
      const result = await this.createOrUpdateVariable(key, value);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Environment variables setup complete: ${successCount}/${variables.length} successful`);

    // Store results for summary
    this.results.variables = results;
  }

  // ==========================================================================
  // Workflow Transfer (Move to Project)
  // ==========================================================================

  async transferWorkflow(workflowId, workflowName) {
    if (!this.config.projectId) {
      return { success: true, skipped: true };
    }

    try {
      await this.client.put(`/workflows/${workflowId}/transfer`, {
        destinationProjectId: this.config.projectId
      });
      this.logger.success(`  → Transferred to project: ${this.config.projectId}`);
      return { success: true, id: workflowId, name: workflowName };
    } catch (error) {
      // If already in project or transfer not needed, that's OK
      if (error.response?.status === 400 || error.response?.data?.message?.includes('same project')) {
        this.logger.debug(`  → Already in target project`);
        return { success: true, id: workflowId, name: workflowName };
      }
      this.logger.warn(`  → Transfer failed: ${error.response?.data?.message || error.message}`);
      return { success: false, id: workflowId, name: workflowName, error: error.message };
    }
  }

  // ==========================================================================
  // Credential Transfer (Move to Project)
  // ==========================================================================

  async transferCredential(credentialId, credentialName) {
    if (!this.config.projectId) {
      return { success: true, skipped: true };
    }

    try {
      await this.client.put(`/credentials/${credentialId}/transfer`, {
        destinationProjectId: this.config.projectId
      });
      this.logger.success(`  → Transferred credential to project: ${credentialName}`);
      return { success: true, id: credentialId, name: credentialName };
    } catch (error) {
      // If already in project or transfer not needed, that's OK
      if (error.response?.status === 400 || error.response?.data?.message?.includes('same project')) {
        this.logger.debug(`  → Credential already in target project`);
        return { success: true, id: credentialId, name: credentialName };
      }
      this.logger.warn(`  → Credential transfer failed: ${error.response?.data?.message || error.message}`);
      return { success: false, id: credentialId, name: credentialName, error: error.message };
    }
  }

  // ==========================================================================
  // Workflow Activation
  // ==========================================================================

  async activateWorkflow(workflowId, workflowName) {
    try {
      await this.client.post(`/workflows/${workflowId}/activate`);
      this.logger.success(`  → Activated: ${workflowName}`);
      return { success: true, id: workflowId, name: workflowName };
    } catch (error) {
      this.logger.warn(`  → Failed to activate ${workflowName}: ${error.response?.data?.message || error.message}`);
      return { success: false, id: workflowId, name: workflowName, error: error.message };
    }
  }

  // ==========================================================================
  // Node Configuration
  // ==========================================================================

  configureNodes(nodes) {
    return nodes.map(node => {
      // Configure ClickUp native nodes
      if (node.type === 'n8n-nodes-base.clickUp') {
        const updatedNode = JSON.parse(JSON.stringify(node));
        
        if (this.clickupCredentialId) {
          updatedNode.credentials = {
            clickUpApi: {
              id: this.clickupCredentialId,
              name: 'ClickUp API'
            }
          };
        }
        
        if (this.config.debug) {
          this.logger.debug(`Node ${node.name}: resource=${updatedNode.parameters?.resource}, operation=${updatedNode.parameters?.operation}`);
        }
        
        return updatedNode;
      }
      
      // Configure HTTP Request nodes with credential placeholders
      if (node.type === 'n8n-nodes-base.httpRequest') {
        const updatedNode = JSON.parse(JSON.stringify(node));
        
        // Check for Reply.io credential placeholder
        if (updatedNode.credentials?.httpHeaderAuth?.id === '{{REPLY_CREDENTIAL_ID}}') {
          if (this.replyCredentialId) {
            updatedNode.credentials.httpHeaderAuth.id = this.replyCredentialId;
            this.logger.debug(`  → Linked Reply.io credential to: ${node.name}`);
          }
        }
        
        // Check for ClickUp credential placeholder
        if (updatedNode.credentials?.httpHeaderAuth?.id === '{{CLICKUP_CREDENTIAL_ID}}') {
          if (this.clickupCredentialId) {
            updatedNode.credentials.httpHeaderAuth.id = this.clickupCredentialId;
            this.logger.debug(`  → Linked ClickUp credential to: ${node.name}`);
          }
        }
        
        // Also handle Reply.io nodes by URL (fallback for older workflows)
        if (!updatedNode.credentials && updatedNode.parameters?.url?.includes('reply.io')) {
          if (this.replyCredentialId) {
            updatedNode.credentials = {
              httpHeaderAuth: {
                id: this.replyCredentialId,
                name: 'Reply.io API'
              }
            };
          }
        }
        
        // Handle ClickUp nodes by URL (fallback for older workflows)
        if (!updatedNode.credentials && updatedNode.parameters?.url?.includes('clickup.com')) {
          if (this.clickupCredentialId) {
            updatedNode.credentials = {
              httpHeaderAuth: {
                id: this.clickupCredentialId,
                name: 'ClickUp API'
              }
            };
          }
        }
        
        return updatedNode;
      }

      // Configure Code nodes - no changes needed since they use $env variables
      if (node.type === 'n8n-nodes-base.code' && node.parameters?.jsCode) {
        const updatedNode = JSON.parse(JSON.stringify(node));
        let jsCode = updatedNode.parameters.jsCode;
        let modified = false;
        
        // Replace hardcoded ClickUp API key with $env variable
        // Pattern: 'Authorization': 'pk_...' in this.helpers.request calls
        const clickupKeyPattern = /'Authorization':\s*'(pk_[^']+)'/g;
        if (clickupKeyPattern.test(jsCode)) {
          jsCode = jsCode.replace(clickupKeyPattern, "'Authorization': $env.CLICKUP_API_KEY");
          modified = true;
          this.logger.debug(`  → Replaced hardcoded ClickUp API key with $env.CLICKUP_API_KEY in "${node.name}"`);
        }
        
        // Replace hardcoded Reply.io API key references with $env variable
        // Pattern: '' (the Reply API key)
        const replyKeyPattern = /''/g;
        if (replyKeyPattern.test(jsCode)) {
          jsCode = jsCode.replace(replyKeyPattern, '$env.REPLY_API_KEY');
          modified = true;
          this.logger.debug(`  → Replaced hardcoded Reply.io API key with $env.REPLY_API_KEY in "${node.name}"`);
        }
        
        // Special handling for "Prepare Lambda Request" node
        if (node.name === 'Prepare Lambda Request') {
          // Replace $env.REPLY_EMAIL with actual value
          jsCode = jsCode.replace(
            /\$env\.REPLY_EMAIL/g, 
            `"${this.config.replyEmail}"`
          );
          
          // Replace $env.REPLY_PASSWORD with actual value
          jsCode = jsCode.replace(
            /\$env\.REPLY_PASSWORD/g, 
            `"${this.config.replyPassword}"`
          );
          
          // Auto-detect and inject the n8n webhook base URL
          const n8nBaseUrl = this.getN8nBaseUrl();
          
          // Replace any hardcoded webhook URL with the auto-detected one
          jsCode = jsCode.replace(
            /const webhookUrl = `https:\/\/[^`]+\/webhook-waiting\/\$\{executionId\}`;/g,
            `const webhookUrl = \`${n8nBaseUrl}/webhook-waiting/\${executionId}\`;`
          );
          
          this.logger.info(`  → Auto-configured webhook URL: ${n8nBaseUrl}/webhook-waiting/{executionId}`);
          modified = true;
        }
        
        if (modified) {
          updatedNode.parameters.jsCode = jsCode;
        }
        
        return updatedNode;
      }
      
      return node;
    });
  }

  /**
   * Derive the n8n base URL from the API URL
   * e.g., https://qtalospace.app.n8n.cloud/api/v1 -> https://qtalospace.app.n8n.cloud
   * e.g., http://localhost:5678/api/v1 -> http://localhost:5678
   */
  getN8nBaseUrl() {
    const apiUrl = this.config.apiUrl;
    // Remove /api/v1 suffix if present
    return apiUrl.replace(/\/api\/v1\/?$/, '');
  }

  // ==========================================================================
  // Workflow Management
  // ==========================================================================

  async getExistingWorkflows() {
    try {
      const response = await this.client.get('/workflows');
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Failed to get existing workflows:', error.message);
      throw error;
    }
  }

  async deployWorkflow(file) {
    const rawWorkflow = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Clean workflow data - only include what n8n API accepts
    const workflowData = {
      name: this.config.workflowPrefix ? `${this.config.workflowPrefix} ${rawWorkflow.name}` : rawWorkflow.name,
      nodes: rawWorkflow.nodes,
      connections: rawWorkflow.connections,
      settings: rawWorkflow.settings || {}
    };
    
    // Only include staticData if it has content
    if (rawWorkflow.staticData && Object.keys(rawWorkflow.staticData).length > 0) {
      workflowData.staticData = rawWorkflow.staticData;
    }
    
    // Configure nodes with credentials
    // Links credential IDs to HTTP Request nodes with placeholders
    workflowData.nodes = this.configureNodes(workflowData.nodes);
    
    this.logger.workflow(workflowData.name, workflowData.nodes.length);
    
    try {
      // Check if workflow exists
      const existing = await this.getExistingWorkflows();
      const existingWorkflow = existing.find(w => w.name === workflowData.name);
      
      let workflowId;
      
      if (existingWorkflow) {
        this.logger.info(`Workflow exists (ID: ${existingWorkflow.id})`);
        this.logger.info('Updating...');
        
        const response = await this.client.put(`/workflows/${existingWorkflow.id}`, workflowData);
        workflowId = response.data.id;
        
        this.logger.success('Updated successfully');
      } else {
        this.logger.info('Creating new workflow...');
        
        const response = await this.client.post('/workflows', workflowData);
        workflowId = response.data.id;
        
        this.logger.success(`Created successfully (ID: ${workflowId})`);
      }
      
      // Transfer to target project if configured
      if (this.config.projectId) {
        await this.transferWorkflow(workflowId, workflowData.name);
      }
      
      return { success: true, id: workflowId, name: workflowData.name };
      
    } catch (error) {
      this.logger.error(`Failed: ${error.response?.data?.message || error.message}`);
      
      if (error.response?.data && this.config.debug) {
        this.logger.debug('API Response:', JSON.stringify(error.response.data, null, 2));
      }
      
      return { success: false, name: workflowData.name, error: error.message };
    }
  }

  async deployAllWorkflows() {
    this.logger.section('Deploying Workflows');

    // Deploy phase workflows first and capture their IDs
    const phaseWorkflows = [
      { file: 'workflows/phase1-import-hygiene.json', order: 1, key: 'phase1' },
      { file: 'workflows/phase2-signatures.json', order: 2, key: 'phase2' },
      { file: 'workflows/phase3-standardize.json', order: 3, key: 'phase3' }
    ];

    // Store workflow IDs for injection into orchestrator
    const workflowIds = {};

    // Deploy phase workflows
    for (const workflow of phaseWorkflows) {
      const result = await this.deployWorkflow(workflow.file);
      this.results.workflows.push(result);
      
      // Capture the workflow ID for later use
      if (result.success) {
        workflowIds[workflow.key] = result.id;
        this.logger.info(`  → Captured ${workflow.key} workflow ID: ${result.id}`);
      }
    }

    // Now deploy orchestrator with the captured workflow IDs
    this.logger.info('');
    this.logger.info('Deploying orchestrator with auto-configured workflow IDs...');
    const orchestratorResult = await this.deployWorkflowWithIds(
      'workflows/main-orchestrator.json',
      workflowIds
    );
    this.results.workflows.push(orchestratorResult);
    
    // Store orchestrator ID for activation
    if (orchestratorResult.success) {
      this.orchestratorId = orchestratorResult.id;
      this.orchestratorName = orchestratorResult.name;
    }
  }

  /**
   * Deploy the orchestrator workflow with injected workflow IDs
   * This method reads the workflow, replaces workflowId references, and deploys
   */
  async deployWorkflowWithIds(file, workflowIds) {
    const rawWorkflow = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Clean workflow data - only include what n8n API accepts
    const workflowData = {
      name: this.config.workflowPrefix ? `${this.config.workflowPrefix} ${rawWorkflow.name}` : rawWorkflow.name,
      nodes: rawWorkflow.nodes,
      connections: rawWorkflow.connections,
      settings: rawWorkflow.settings || {},
      staticData: rawWorkflow.staticData || null
    };
    
    // Update workflow IDs in Execute Workflow nodes
    workflowData.nodes = workflowData.nodes.map(node => {
      if (node.type === 'n8n-nodes-base.executeWorkflow') {
        const updatedNode = JSON.parse(JSON.stringify(node));
        
        // Determine which phase this node executes based on node name
        if (node.name.includes('Phase 1') && workflowIds.phase1) {
          updatedNode.parameters.workflowId = workflowIds.phase1;
          this.logger.info(`  → Updated "Execute Phase 1" workflow ID: ${workflowIds.phase1}`);
        } else if (node.name.includes('Phase 2') && workflowIds.phase2) {
          updatedNode.parameters.workflowId = workflowIds.phase2;
          this.logger.info(`  → Updated "Execute Phase 2" workflow ID: ${workflowIds.phase2}`);
        } else if (node.name.includes('Phase 3') && workflowIds.phase3) {
          updatedNode.parameters.workflowId = workflowIds.phase3;
          this.logger.info(`  → Updated "Execute Phase 3" workflow ID: ${workflowIds.phase3}`);
        }
        
        return updatedNode;
      }
      return node;
    });
    
    // Configure nodes with credentials
    workflowData.nodes = this.configureNodes(workflowData.nodes);
    
    this.logger.workflow(workflowData.name, workflowData.nodes.length);
    
    try {
      // Check if workflow exists
      const existing = await this.getExistingWorkflows();
      const existingWorkflow = existing.find(w => w.name === workflowData.name);
      
      let workflowId;
      
      if (existingWorkflow) {
        this.logger.info(`Workflow exists (ID: ${existingWorkflow.id})`);
        this.logger.info('Updating...');
        
        const response = await this.client.put(`/workflows/${existingWorkflow.id}`, workflowData);
        workflowId = response.data.id;
        
        this.logger.success('Updated successfully');
      } else {
        this.logger.info('Creating new workflow...');
        
        const response = await this.client.post('/workflows', workflowData);
        workflowId = response.data.id;
        
        this.logger.success(`Created successfully (ID: ${workflowId})`);
      }
      
      // Transfer to target project if configured
      if (this.config.projectId) {
        await this.transferWorkflow(workflowId, workflowData.name);
      }
      
      return { success: true, id: workflowId, name: workflowData.name };
      
    } catch (error) {
      this.logger.error(`Failed: ${error.response?.data?.message || error.message}`);
      
      if (error.response?.data && this.config.debug) {
        this.logger.debug('API Response:', JSON.stringify(error.response.data, null, 2));
      }
      
      return { success: false, name: workflowData.name, error: error.message };
    }
  }

  // ==========================================================================
  // System Workflow Deployment (Multi-tenant)
  // ==========================================================================

  async deploySystemWorkflows() {
    this.logger.section('Deploying System Workflows (Multi-tenant)');

    const systemWorkflowsDir = 'system';
    
    // Check if system directory exists
    if (!fs.existsSync(systemWorkflowsDir)) {
      this.logger.info('No system workflows directory found - skipping');
      return;
    }

    const systemWorkflows = [
      { file: `${systemWorkflowsDir}/client-onboarding.json`, name: 'Client Onboarding' },
      { file: `${systemWorkflowsDir}/workflow-replicator.json`, name: 'Workflow Replicator' },
      { file: `${systemWorkflowsDir}/auto-onboarding-webhook.json`, name: 'Auto Client Onboarding' },
      { file: `${systemWorkflowsDir}/deployment-callback.json`, name: 'Deployment Callback Handler' },
      { file: `${systemWorkflowsDir}/status-change-router.json`, name: 'Status Change Router' }
    ];

    for (const workflow of systemWorkflows) {
      if (fs.existsSync(workflow.file)) {
        const result = await this.deployWorkflow(workflow.file);
        this.results.workflows.push(result);
      } else {
        this.logger.warn(`System workflow not found: ${workflow.file}`);
      }
    }
  }

  // ==========================================================================
  // Orchestrator Activation
  // ==========================================================================

  async activateOrchestratorWorkflows() {
    this.logger.section('Activating Orchestrator Workflows');
    
    if (this.orchestratorId) {
      this.logger.info(`Activating Main Orchestrator (webhooks need to be active)...`);
      await this.activateWorkflow(this.orchestratorId, this.orchestratorName);
    } else {
      this.logger.warn('No orchestrator workflow to activate');
    }
  }

  // ==========================================================================
  // Summary & Reporting
  // ==========================================================================

  printSummary() {
    this.logger.section('Deployment Summary');

    // Credentials Summary
    if (this.results.credentials.length > 0) {
      const successfulCreds = this.results.credentials.filter(c => c.success);
      const failedCreds = this.results.credentials.filter(c => !c.success);

      this.logger.info(`Credentials: ${successfulCreds.length}/${this.results.credentials.length} successful`);
      
      if (successfulCreds.length > 0) {
        successfulCreds.forEach(c => {
          this.logger.success(`  ${c.name} (ID: ${c.id})`);
        });
      }

      if (failedCreds.length > 0) {
        this.logger.error(`Failed credentials: ${failedCreds.length}`);
        failedCreds.forEach(c => {
          this.logger.error(`  ${c.name}: ${c.error}`);
        });
      }
      console.log();
    }

    // Environment Variables Summary
    if (this.results.variables && this.results.variables.length > 0) {
      const successfulVars = this.results.variables.filter(v => v.success);
      const failedVars = this.results.variables.filter(v => !v.success);

      this.logger.info(`Environment Variables: ${successfulVars.length}/${this.results.variables.length} successful`);
      
      if (successfulVars.length > 0) {
        successfulVars.forEach(v => {
          this.logger.success(`  $env.${v.key} (${v.action})`);
        });
      }

      if (failedVars.length > 0) {
        this.logger.error(`Failed variables: ${failedVars.length}`);
        failedVars.forEach(v => {
          this.logger.error(`  ${v.key}: ${v.error}`);
        });
      }
      console.log();
    }

    // Workflows Summary
    const successfulWorkflows = this.results.workflows.filter(w => w.success);
    const failedWorkflows = this.results.workflows.filter(w => !w.success);

    this.logger.info(`Workflows: ${successfulWorkflows.length}/${this.results.workflows.length} successful`);
    
    if (successfulWorkflows.length > 0) {
      successfulWorkflows.forEach(w => {
        this.logger.success(`  ${w.name} (ID: ${w.id})`);
      });
    }

    if (failedWorkflows.length > 0) {
      console.log();
      this.logger.error(`Failed workflows: ${failedWorkflows.length}`);
      failedWorkflows.forEach(w => {
        this.logger.error(`  ${w.name}: ${w.error}`);
      });
    }

    console.log();
    
    if (failedWorkflows.length === 0 && 
        (this.results.credentials.length === 0 || this.results.credentials.filter(c => c.success).length > 0)) {
      this.logger.success('All deployments completed successfully! ✨');
      this.logger.info('');
      this.logger.info('Next steps:');
      const n8nBaseUrl = this.getN8nBaseUrl();
      this.logger.info(`  1. Open n8n: ${n8nBaseUrl}/workflows`);
      this.logger.info('  2. Activate "Main Orchestrator" workflow');
      this.logger.info('  3. Configure ClickUp webhook or trigger');
      this.logger.info('  4. Test with sample data');
      return true;
    } else {
      this.logger.error('Some deployments failed. Please check the errors above.');
      return false;
    }
  }

  // ==========================================================================
  // Main Deployment Process
  // ==========================================================================

  async deploy() {
    try {
      // Test connection
      const connected = await this.testConnection();
      if (!connected) {
        return false;
      }

      // Setup credentials
      await this.setupCredentials();

      // Setup environment variables (for $env usage in workflows)
      await this.setupEnvironmentVariables();

      // Deploy workflows
      await this.deployAllWorkflows();

      // Deploy system workflows (multi-tenant)
      await this.deploySystemWorkflows();

      // Activate the Main Orchestrator (it has webhooks that need to be active)
      await this.activateOrchestratorWorkflows();

      // Print summary
      return this.printSummary();

    } catch (error) {
      this.logger.error('Deployment failed with unexpected error');
      this.logger.error(error.message);
      if (this.config.debug) {
        this.logger.debug(error.stack);
      }
      return false;
    }
  }
}

// ============================================================================
// Client Replication Functions
// ============================================================================

async function getActiveClients(apiGatewayUrl) {
  const axios = require('axios');
  const response = await axios.get(`${apiGatewayUrl}/clients`);
  return (response.data.clients || []).filter(c => c.status === 'active');
}

async function getClientCredentials(apiGatewayUrl, clientId) {
  const axios = require('axios');
  const response = await axios.get(`${apiGatewayUrl}/credentials/${clientId}`);
  return response.data.credentials || {};
}

async function updateClientWorkflowIds(apiGatewayUrl, clientId, workflowIds) {
  const axios = require('axios');
  await axios.put(`${apiGatewayUrl}/workflows`, {
    client_id: clientId,
    workflow_ids: workflowIds
  });
}

function applyClientReplacements(template, client, credentials) {
  let templateStr = JSON.stringify(template);
  
  const replacements = {
    '{{CLIENT_ID}}': client.client_id,
    '{{CLIENT_NAME}}': client.client_name,
    '{{CLICKUP_SPACE_ID}}': client.clickup_space_id || client.client_id,
    '{{REPLY_API_KEY}}': credentials.reply_api_key || '',
    '{{CLICKUP_API_KEY}}': credentials.clickup_api_key || '',
    '{{REPLY_WORKSPACE_ID}}': credentials.reply_workspace_id || 'default',
    '{{CLICKUP_WORKSPACE_ID}}': credentials.clickup_workspace_id || 'default'
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    templateStr = templateStr.split(placeholder).join(value);
  }
  
  return JSON.parse(templateStr);
}

async function replicateToClient(client, config, logger) {
  const fs = require('fs');
  const path = require('path');
  const axios = require('axios');
  
  logger.info(`\nProcessing client: ${client.client_name} (${client.client_id})`);
  
  // Get credentials
  let credentials;
  try {
    credentials = await getClientCredentials(config.apiGatewayUrl, client.client_id);
  } catch (error) {
    logger.error(`Failed to get credentials: ${error.message}`);
    return { success: false, error: error.message };
  }
  
  // Templates to deploy
  const templates = [
    { file: 'templates/phase1-import-hygiene.template.json', key: 'phase1-import-hygiene', displayName: 'Phase 1: Import & Hygiene' },
    { file: 'templates/phase2-signatures.template.json', key: 'phase2-signatures', displayName: 'Phase 2: Signatures & Opt-Outs' },
    { file: 'templates/phase3-standardize.template.json', key: 'phase3-standardize', displayName: 'Phase 3: Standardize Workspace' },
    { file: 'templates/main-orchestrator.template.json', key: 'main-orchestrator', displayName: 'Main Orchestrator', isOrchestrator: true }
  ];
  
  const n8nApi = axios.create({
    baseURL: config.apiUrl,
    headers: {
      'X-N8N-API-KEY': config.apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
  
  // Get existing workflows
  const existingResponse = await n8nApi.get('/workflows');
  const existingWorkflows = existingResponse.data.data || [];
  
  const deployedWorkflows = {};
  const results = [];
  
  for (const template of templates) {
    const templatePath = path.join(process.cwd(), template.file);
    
    if (!fs.existsSync(templatePath)) {
      logger.warn(`  Template not found: ${template.file}`);
      continue;
    }
    
    try {
      logger.info(`  📦 ${template.displayName}`);
      
      // Read and process template
      const rawTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      let processedTemplate = applyClientReplacements(rawTemplate, client, credentials);
      
      // For orchestrator, inject phase workflow IDs
      if (template.isOrchestrator) {
        processedTemplate.nodes = processedTemplate.nodes.map(node => {
          if (node.type === 'n8n-nodes-base.executeWorkflow') {
            if (node.name.includes('Phase 1') && deployedWorkflows['phase1-import-hygiene']) {
              node.parameters.workflowId = deployedWorkflows['phase1-import-hygiene'];
            } else if (node.name.includes('Phase 2') && deployedWorkflows['phase2-signatures']) {
              node.parameters.workflowId = deployedWorkflows['phase2-signatures'];
            } else if (node.name.includes('Phase 3') && deployedWorkflows['phase3-standardize']) {
              node.parameters.workflowId = deployedWorkflows['phase3-standardize'];
            }
          }
          return node;
        });
      }
      
      // Set client-specific workflow name
      const workflowName = `${client.client_name} - ${template.displayName}`;
      processedTemplate.name = workflowName;
      
      // Prepare payload
      const payload = {
        name: processedTemplate.name,
        nodes: processedTemplate.nodes,
        connections: processedTemplate.connections,
        settings: processedTemplate.settings || {},
        staticData: processedTemplate.staticData || null
      };
      
      // Check if exists
      const existingWorkflow = existingWorkflows.find(w => w.name === workflowName);
      const existingId = existingWorkflow?.id || client.workflow_ids?.[template.key];
      
      let result;
      if (existingId) {
        const response = await n8nApi.put(`/workflows/${existingId}`, payload);
        result = { id: response.data.id, action: 'updated' };
      } else {
        const response = await n8nApi.post('/workflows', payload);
        result = { id: response.data.id, action: 'created' };
      }
      
      deployedWorkflows[template.key] = result.id;
      logger.success(`     ${result.action}: ${workflowName} (ID: ${result.id})`);
      results.push({ template: template.key, ...result, success: true });
      
    } catch (error) {
      logger.error(`     Failed: ${error.response?.data?.message || error.message}`);
      results.push({ template: template.key, success: false, error: error.message });
    }
  }
  
  // Update workflow IDs in DynamoDB
  if (Object.keys(deployedWorkflows).length > 0) {
    try {
      await updateClientWorkflowIds(config.apiGatewayUrl, client.client_id, deployedWorkflows);
      logger.success(`  Updated workflow IDs in DynamoDB`);
    } catch (error) {
      logger.warn(`  Failed to update workflow IDs: ${error.message}`);
    }
  }
  
  // Activate the Main Orchestrator workflow (it has a webhook that needs to be active)
  if (deployedWorkflows['main-orchestrator']) {
    try {
      logger.info(`  🔄 Activating Main Orchestrator workflow...`);
      await n8nApi.post(`/workflows/${deployedWorkflows['main-orchestrator']}/activate`);
      logger.success(`  ✅ Main Orchestrator activated and ready to receive webhooks`);
    } catch (error) {
      logger.warn(`  ⚠️ Failed to activate Main Orchestrator: ${error.message}`);
      logger.warn(`     You may need to activate it manually in n8n`);
    }
  }
  
  return {
    success: results.every(r => r.success),
    workflows: deployedWorkflows,
    results
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  // Load environment variables
  require('dotenv').config();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const clientArg = args.find(a => a.startsWith('--client='));
  const allClients = args.includes('--all-clients');
  const specificClient = clientArg ? clientArg.split('=')[1] : null;

  // Configuration
  const config = {
    apiUrl: process.env.N8N_API_URL || 'http://localhost:5678/api/v1',
    apiKey: process.env.N8N_API_KEY,
    projectId: process.env.N8N_PROJECT_ID || null, // n8n Cloud project ID
    apiGatewayUrl: process.env.API_GATEWAY_URL || 'https://zxn1hyal26.execute-api.us-east-1.amazonaws.com/prod',
    isCloud: (process.env.N8N_API_URL || '').includes('app.n8n.cloud'),
    workflowPrefix: process.env.WORKFLOW_PREFIX || '',
    clickupApiKey: process.env.CLICKUP_API_KEY,
    clickupTeamId: process.env.CLICKUP_TEAM_ID,
    clickupSpaceId: process.env.CLICKUP_SPACE_ID,
    clickupFolderId: process.env.CLICKUP_FOLDER_ID,
    clickupListId: process.env.CLICKUP_LIST_ID,
    replyApiKey: process.env.REPLY_API_KEY,
    replyEmail: process.env.REPLY_EMAIL,
    replyPassword: process.env.REPLY_PASSWORD,
    githubPat: process.env.GITHUB_PAT,
    githubRepoOwner: process.env.GITHUB_REPO_OWNER,
    githubRepoName: process.env.GITHUB_REPO_NAME,
    debug: process.env.DEBUG === 'true'
  };

  // Initialize logger
  const logLevel = process.env.LOG_LEVEL || 'info';
  const logger = new Logger(logLevel);

  // Show mode
  logger.section('n8n Professional Deployment System');
  
  if (allClients) {
    logger.info('Mode: 🔄 Replicate to ALL clients');
  } else if (specificClient) {
    logger.info(`Mode: 👤 Deploy for client: ${specificClient}`);
  } else {
    logger.info('Mode: 📦 Deploy base workflows');
  }
  
  logger.info(`API URL: ${config.apiUrl}`);
  logger.info(`Target: ${config.isCloud ? '☁️  n8n Cloud' : '🐳 Local Docker'}`);
  if (config.projectId) {
    logger.info(`Project ID: ${config.projectId}`);
  }
  if (allClients || specificClient) {
    logger.info(`API Gateway: ${config.apiGatewayUrl}`);
  }
  logger.info(`Debug Mode: ${config.debug ? 'enabled' : 'disabled'}`);
  console.log();

  // Validate configuration
  if (!config.apiKey) {
    logger.error('N8N_API_KEY environment variable is required');
    logger.info('');
    logger.info('To get your API key:');
    logger.info('  1. Open: http://localhost:5678/settings/api');
    logger.info('  2. Click "Create API Key"');
    logger.info('  3. Export: export N8N_API_KEY="your_key_here"');
    logger.info('  4. Run this script again');
    process.exit(1);
  }

  // Handle client replication modes
  if (allClients || specificClient) {
    try {
      logger.section('Client Workflow Replication');
      
      // Get clients
      let clients;
      if (allClients) {
        logger.info('Fetching all active clients...');
        clients = await getActiveClients(config.apiGatewayUrl);
        logger.success(`Found ${clients.length} active clients`);
      } else {
        logger.info(`Fetching client: ${specificClient}...`);
        const allActiveClients = await getActiveClients(config.apiGatewayUrl);
        clients = allActiveClients.filter(c => c.client_id === specificClient);
        if (clients.length === 0) {
          logger.error(`Client not found: ${specificClient}`);
          process.exit(1);
        }
      }
      
      // Replicate to each client
      const summary = { total: clients.length, successful: 0, failed: 0 };
      
      for (const client of clients) {
        const result = await replicateToClient(client, config, logger);
        if (result.success) {
          summary.successful++;
        } else {
          summary.failed++;
        }
      }
      
      // Print summary
      logger.section('Replication Summary');
      logger.info(`Total clients: ${summary.total}`);
      logger.success(`Successful: ${summary.successful}`);
      if (summary.failed > 0) {
        logger.error(`Failed: ${summary.failed}`);
      }
      
      if (summary.failed === 0) {
        logger.success('\nAll client workflows replicated successfully! ✨');
      } else {
        logger.error('\nSome replications failed. Check errors above.');
        process.exit(1);
      }
      
      process.exit(0);
      
    } catch (error) {
      logger.error(`Replication failed: ${error.message}`);
      if (config.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  // Standard deployment mode (no client flags)
  if (!config.clickupApiKey) {
    logger.warn('CLICKUP_API_KEY not set - you will need to configure ClickUp credentials manually');
  }

  if (!config.replyApiKey) {
    logger.warn('REPLY_API_KEY not set - you will need to configure Reply.io credentials manually');
  }

  if (!config.clickupTeamId || !config.clickupListId) {
    logger.warn('ClickUp workspace IDs not set - nodes will have placeholder values');
    logger.info('  Set these in .env: CLICKUP_TEAM_ID, CLICKUP_SPACE_ID, CLICKUP_FOLDER_ID, CLICKUP_LIST_ID');
  }

  // Create deployment manager and run
  const manager = new N8nDeploymentManager(config, logger);
  const success = await manager.deploy();

  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { N8nDeploymentManager, Logger };
