const orchestratorWorkflow = $input.first().json;
const collectedIds = $('Collect Workflow IDs').first().json;
const workflowIds = collectedIds.workflow_ids;

const phase1Id = workflowIds.phase1 || '';
const phase2Id = workflowIds.phase2 || '';
const phase3Id = workflowIds.phase3 || '';

console.log('Injecting Phase IDs into Orchestrator:');
console.log('- Phase 1:', phase1Id);
console.log('- Phase 2:', phase2Id);
console.log('- Phase 3:', phase3Id);

const updatedNodes = orchestratorWorkflow.nodes.map(node => {
  if (node.parameters && node.parameters.workflowId) {
    if (node.parameters.workflowId === '{{PHASE1_WORKFLOW_ID}}' || node.name.includes('Phase 1')) {
      node.parameters.workflowId = phase1Id;
      console.log(`Updated ${node.name} with Phase 1 ID: ${phase1Id}`);
    }
    if (node.parameters.workflowId === '{{PHASE2_WORKFLOW_ID}}' || node.name.includes('Phase 2')) {
      node.parameters.workflowId = phase2Id;
      console.log(`Updated ${node.name} with Phase 2 ID: ${phase2Id}`);
    }
    if (node.parameters.workflowId === '{{PHASE3_WORKFLOW_ID}}' || node.name.includes('Phase 3')) {
      node.parameters.workflowId = phase3Id;
      console.log(`Updated ${node.name} with Phase 3 ID: ${phase3Id}`);
    }
  }
  return node;
});

const updatedWorkflow = {
  name: orchestratorWorkflow.name,
  nodes: updatedNodes,
  connections: orchestratorWorkflow.connections,
  settings: orchestratorWorkflow.settings || { executionOrder: 'v1' }
};

return [{
  json: {
    orchestrator_id: workflowIds.orchestrator,
    updated_workflow: updatedWorkflow,
    workflow_ids: workflowIds,
    client_id: collectedIds.client_id,
    client_name: collectedIds.client_name,
    clickup_task_id: collectedIds.clickup_task_id
  }
}];