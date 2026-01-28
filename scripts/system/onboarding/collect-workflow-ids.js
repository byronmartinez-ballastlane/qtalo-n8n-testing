// Collect all created workflow IDs from the Create Workflow node
const createItems = $('Create Workflow in n8n').all();
const decodeItems = $('Decode & Inject Client Values').all();
const extractInfo = $('Extract Client Info').first().json;

const workflowIds = {};
const clientId = decodeItems[0]?.json.client_id;
const clientName = decodeItems[0]?.json.client_name;

createItems.forEach((item, index) => {
  const templateKey = decodeItems[index]?.json.template_key;
  const workflowId = item.json.id;
  
  if (templateKey && workflowId) {
    workflowIds[templateKey] = workflowId;
  }
});

return [{
  json: {
    client_id: clientId,
    client_name: clientName,
    workflow_ids: workflowIds,
    clickup_task_id: extractInfo.clickup_task_id
  }
}];