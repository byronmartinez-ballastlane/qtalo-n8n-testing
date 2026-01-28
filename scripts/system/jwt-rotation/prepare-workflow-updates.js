// Store credential IDs and output one item per workflow to update
const oldData = $('Find Credential From Workflows').first().json;
const verifyData = $input.first().json;

console.log(`Credential ${verifyData.new_credential_id} verified in project: ${verifyData.project_name}`);

// Output one item per workflow for the loop
const items = oldData.workflow_ids.map(wfId => ({
  json: {
    old_credential_id: oldData.old_credential_id,
    old_credential_name: oldData.old_credential_name,
    credential_type: oldData.credential_type,
    new_credential_id: verifyData.new_credential_id,
    new_credential_name: verifyData.new_credential_name,
    project_id: verifyData.project_id,
    project_name: verifyData.project_name,
    workflow_id: wfId,
    total_workflows: oldData.workflow_ids.length
  }
}));

return items;