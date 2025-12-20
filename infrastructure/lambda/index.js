/**
 * Qtalo n8n Multi-Tenant Management Lambda
 * 
 * Handles:
 * - Client onboarding (create DynamoDB record + Secrets Manager secret)
 * - Client listing
 * - Workflow ID updates
 * - Template version management
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, UpdateSecretCommand, DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'qtalo-n8n-clients';

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({ region: REGION });

// Response helper
const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  },
  body: JSON.stringify(body)
});

// Main handler
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return response(200, { message: 'OK' });
  }
  
  const path = event.path || event.rawPath || '';
  const method = event.httpMethod || event.requestContext?.http?.method;
  let body = {};
  
  try {
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch (e) {
    return response(400, { error: 'Invalid JSON body' });
  }
  
  try {
    // Route handling
    if (path.includes('/clients') && method === 'GET') {
      // List all clients or get specific client
      const clientId = event.pathParameters?.clientId;
      if (clientId) {
        return await getClient(clientId);
      }
      // Check for task_id query param (lookup by ClickUp task)
      if (event.queryStringParameters?.task_id) {
        return await getClientByTaskId(event.queryStringParameters.task_id);
      }
      return await listClients(event.queryStringParameters);
    }
    
    if (path.includes('/clients') && method === 'POST') {
      return await onboardClient(body);
    }
    
    if (path.includes('/clients') && method === 'PUT') {
      const clientId = event.pathParameters?.clientId || body.client_id;
      return await updateClient(clientId, body);
    }
    
    if (path.includes('/clients') && method === 'DELETE') {
      const clientId = event.pathParameters?.clientId;
      return await deleteClient(clientId);
    }
    
    if (path.includes('/workflows') && method === 'PUT') {
      return await updateWorkflowIds(body);
    }
    
    if (path.includes('/credentials') && method === 'GET') {
      const clientId = event.pathParameters?.clientId || event.queryStringParameters?.client_id;
      return await getCredentials(clientId);
    }
    
    if (path.includes('/sync') && method === 'POST') {
      return await syncClients(body);
    }
    
    if (path.includes('/health')) {
      return response(200, { status: 'healthy', timestamp: new Date().toISOString() });
    }
    
    return response(404, { error: 'Not found', path, method });
    
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: error.message, stack: error.stack });
  }
};

// ============================================================
// Client Operations
// ============================================================

async function listClients(queryParams = {}) {
  const params = {
    TableName: TABLE_NAME
  };
  
  // Filter by status if provided
  if (queryParams?.status) {
    params.FilterExpression = '#status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues = { ':status': queryParams.status };
  }
  
  const result = await docClient.send(new ScanCommand(params));
  
  return response(200, {
    clients: result.Items || [],
    count: result.Count || 0
  });
}

async function getClient(clientId) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { client_id: clientId }
  }));
  
  if (!result.Item) {
    return response(404, { error: 'Client not found' });
  }
  
  return response(200, result.Item);
}

// Find client by ClickUp task_id (for task→client mapping)
async function getClientByTaskId(taskId) {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: 'clickup_task_id = :taskId',
    ExpressionAttributeValues: { ':taskId': taskId }
  };
  
  const result = await docClient.send(new ScanCommand(params));
  
  if (!result.Items || result.Items.length === 0) {
    return response(404, { error: 'No client found for task_id', task_id: taskId });
  }
  
  // Return first match (should only be one)
  return response(200, result.Items[0]);
}

async function onboardClient(body) {
  const {
    client_name,
    reply_api_key,
    clickup_api_key,
    reply_workspace_id = 'default',
    clickup_space_id,
    clickup_workspace_id = 'default',
    clickup_task_id  // ClickUp task ID for task→client mapping
  } = body;
  
  // client_id can be provided or auto-generated
  let client_id = body.client_id;
  
  if (!client_name) {
    return response(400, { error: 'client_name is required' });
  }
  
  if (!reply_api_key || !clickup_api_key) {
    return response(400, { error: 'reply_api_key and clickup_api_key are required' });
  }
  
  // Generate client_id if not provided (ensures uniqueness for multi-tenancy)
  if (!client_id) {
    // Create slug from client name + short UUID for uniqueness
    const slug = client_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    const uniqueSuffix = crypto.randomUUID().split('-')[0]; // 8 char hex
    client_id = `${slug}-${uniqueSuffix}`;
  }
  
  // Validate client_id format
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(client_id) && client_id.length > 2) {
    // Auto-fix invalid client_id
    client_id = client_id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  // Check if client already exists
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { client_id }
  }));
  
  if (existing.Item) {
    return response(409, { error: 'Client already exists', client_id });
  }
  
  // Create secret in Secrets Manager
  const secretName = `n8n/clients/${client_id}`;
  const secretValue = JSON.stringify({
    reply_api_key,
    clickup_api_key,
    reply_workspace_id,
    clickup_workspace_id
  });
  
  let secretArn;
  try {
    const secretResult = await secretsClient.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: secretValue,
      Description: `Credentials for n8n client: ${client_name}`
    }));
    secretArn = secretResult.ARN;
  } catch (error) {
    if (error.name === 'ResourceExistsException') {
      // Update existing secret
      await secretsClient.send(new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretValue
      }));
      secretArn = `arn:aws:secretsmanager:${REGION}:${process.env.AWS_ACCOUNT_ID || '166565198800'}:secret:${secretName}`;
    } else {
      throw error;
    }
  }
  
  // Create DynamoDB record
  const timestamp = new Date().toISOString();
  const item = {
    client_id,
    client_name,
    clickup_space_id: clickup_space_id || client_id,
    clickup_task_id: clickup_task_id || null,  // For task→client mapping
    secrets_arn: secretArn,
    template_version: '1.0.0',
    status: 'pending_deployment',  // Will be 'active' after workflows deployed
    workflow_ids: {},
    created_at: timestamp,
    updated_at: timestamp
  };
  
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));
  
  return response(201, {
    message: 'Client onboarded successfully',
    client_id,  // Return the generated client_id
    client: item,
    secrets_arn: secretArn,
    next_steps: [
      'Deploy workflows from templates',
      'Update workflow_ids with deployed workflow IDs',
      'Activate workflows in n8n'
    ]
  });
}

async function updateClient(clientId, body) {
  if (!clientId) {
    return response(400, { error: 'client_id is required' });
  }
  
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  // Build update expression dynamically
  const allowedFields = ['client_name', 'clickup_space_id', 'clickup_task_id', 'template_version', 'status', 'workflow_ids'];
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = body[field];
    }
  }
  
  if (updateExpressions.length === 0) {
    return response(400, { error: 'No valid fields to update' });
  }
  
  // Always update updated_at
  updateExpressions.push('#updated_at = :updated_at');
  expressionAttributeNames['#updated_at'] = 'updated_at';
  expressionAttributeValues[':updated_at'] = new Date().toISOString();
  
  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { client_id: clientId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  
  return response(200, {
    message: 'Client updated successfully',
    client: result.Attributes
  });
}

async function deleteClient(clientId) {
  if (!clientId) {
    return response(400, { error: 'client_id is required' });
  }
  
  // Get client to find secret ARN
  const client = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { client_id: clientId }
  }));
  
  if (!client.Item) {
    return response(404, { error: 'Client not found' });
  }
  
  // Delete secret
  try {
    await secretsClient.send(new DeleteSecretCommand({
      SecretId: `n8n/clients/${clientId}`,
      ForceDeleteWithoutRecovery: true
    }));
  } catch (error) {
    console.warn('Failed to delete secret:', error.message);
  }
  
  // Delete DynamoDB record
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { client_id: clientId }
  }));
  
  return response(200, {
    message: 'Client deleted successfully',
    client_id: clientId
  });
}

// ============================================================
// Workflow Operations
// ============================================================

async function updateWorkflowIds(body) {
  const { client_id, workflow_ids } = body;
  
  if (!client_id || !workflow_ids) {
    return response(400, { error: 'client_id and workflow_ids are required' });
  }
  
  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { client_id },
    UpdateExpression: 'SET workflow_ids = :wf, updated_at = :ts',
    ExpressionAttributeValues: {
      ':wf': workflow_ids,
      ':ts': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  }));
  
  return response(200, {
    message: 'Workflow IDs updated',
    client: result.Attributes
  });
}

// ============================================================
// Credentials Operations
// ============================================================

async function getCredentials(clientId) {
  if (!clientId) {
    return response(400, { error: 'client_id is required' });
  }
  
  try {
    const result = await secretsClient.send(new GetSecretValueCommand({
      SecretId: `n8n/clients/${clientId}`
    }));
    
    const credentials = JSON.parse(result.SecretString);
    
    return response(200, {
      client_id: clientId,
      credentials
    });
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return response(404, { error: 'Credentials not found for client' });
    }
    throw error;
  }
}

// ============================================================
// Sync Operations (for Replicator)
// ============================================================

async function syncClients(body) {
  const { current_template_version = '1.0.0' } = body;
  
  // Get all active clients
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: '#status = :active',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':active': 'active' }
  }));
  
  const clients = result.Items || [];
  const needsUpdate = [];
  const upToDate = [];
  
  for (const client of clients) {
    if (client.template_version !== current_template_version) {
      // Get credentials for this client
      try {
        const secretResult = await secretsClient.send(new GetSecretValueCommand({
          SecretId: `n8n/clients/${client.client_id}`
        }));
        const credentials = JSON.parse(secretResult.SecretString);
        
        needsUpdate.push({
          ...client,
          credentials
        });
      } catch (error) {
        console.error(`Failed to get credentials for ${client.client_id}:`, error);
        needsUpdate.push({
          ...client,
          credentials: null,
          error: 'Failed to retrieve credentials'
        });
      }
    } else {
      upToDate.push(client);
    }
  }
  
  return response(200, {
    current_template_version,
    total_clients: clients.length,
    needs_update: needsUpdate.length,
    up_to_date: upToDate.length,
    clients_to_update: needsUpdate,
    clients_up_to_date: upToDate.map(c => ({ client_id: c.client_id, client_name: c.client_name }))
  });
}
