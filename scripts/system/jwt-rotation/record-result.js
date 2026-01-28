// Record update result and pass back to loop
const transformData = $('Transform Workflow').first().json;
const putResult = $input.first().json;

const success = putResult.id !== undefined;

console.log(`Workflow ${transformData.workflow_id} update: ${success ? 'SUCCESS' : 'FAILED'}`);

return [{
  json: {
    workflow_id: transformData.workflow_id,
    workflow_name: transformData.workflow_name,
    status: success ? 'updated' : 'error',
    error: success ? null : (putResult.message || 'Unknown error'),
    old_credential_id: transformData.old_credential_id,
    new_credential_id: transformData.new_credential_id,
    total_workflows: transformData.total_workflows
  }
}];