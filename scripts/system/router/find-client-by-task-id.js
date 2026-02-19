const taskId = $('Parse Webhook').first().json.task_id;
const response = $input.first().json;

console.log('🔍 Lambda response:', JSON.stringify(response, null, 2));

if (!response.exists || !response.client || !response.client.client_id) {
  console.log(`❌ No client found for task_id: ${taskId}`);
  return [{ json: { skip: true, reason: `No client found for task ${taskId}` } }];
}

const client = response.client;
console.log(`✅ Found client: ${client.client_name} (${client.client_id})`);
console.log(`📋 Workflow IDs:`, client.workflow_ids);

if (!client.workflow_ids || Object.keys(client.workflow_ids).length === 0) {
  console.log('⚠️ Client has no workflow_ids - workflows may not have been deployed');
}

return [{
  json: {
    skip: false,
    client_id: client.client_id,
    client_name: client.client_name,
    task_id: taskId,
    workflow_ids: client.workflow_ids || {},
    clickup_space_id: client.clickup_space_id,
    status: client.status,
    last_processed_status: client.last_processed_status
  }
}];