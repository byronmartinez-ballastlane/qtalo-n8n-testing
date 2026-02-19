const updateData = $('Aggregate Results').first().json;
const deleteResult = $input.first().json;

return [{
  json: {
    success: true,
    old_credential_id: updateData.old_credential_id,
    old_credential_deleted: !deleteResult.error,
    new_credential_id: updateData.new_credential_id,
    workflows_updated: updateData.workflows_updated,
    workflows_errored: updateData.workflows_errored,
    details: updateData.results
  }
}];