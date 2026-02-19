const batchData = $('Loop Over Workflows').first().json;
const workflow = $input.first().json;

const oldCredId = batchData.old_credential_id;
const newCredId = batchData.new_credential_id;
const newCredName = batchData.new_credential_name;

const updatedNodes = workflow.nodes.map(node => {
  if (!node.credentials) return node;
  
  for (const credType of Object.keys(node.credentials)) {
    if (node.credentials[credType].id === oldCredId) {
      node.credentials[credType] = { id: newCredId, name: newCredName };
    }
  }
  return node;
});

const updatePayload = {
  name: workflow.name,
  nodes: updatedNodes,
  connections: workflow.connections,
  settings: workflow.settings,
  staticData: workflow.staticData
};

console.log(`Transformed workflow ${workflow.id} (${workflow.name}) for update`);

return [{
  json: {
    workflow_id: workflow.id,
    workflow_name: workflow.name,
    update_payload: updatePayload,
    old_credential_id: oldCredId,
    new_credential_id: newCredId,
    total_workflows: batchData.total_workflows
  }
}];