const results = $input.all().map(i => i.json);

const updated = results.filter(r => r.status === 'updated').length;
const errored = results.filter(r => r.status === 'error').length;

const firstResult = results[0] || {};

console.log(`Workflow updates complete: ${updated} updated, ${errored} errors`);

return [{
  json: {
    old_credential_id: firstResult.old_credential_id,
    new_credential_id: firstResult.new_credential_id,
    workflows_updated: updated,
    workflows_errored: errored,
    results: results
  }
}];