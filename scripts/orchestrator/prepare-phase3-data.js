// Prepare data to pass to Phase 3
// Include mailboxes from Phase 1 for sequence assignment
const config = $('Extract Configuration').first().json;
const phase1Result = $('Execute Phase 1').first().json;

// Extract mailboxes from Phase 1's Return Mailboxes node output
const mailboxes = phase1Result.mailboxes || [];

console.log(`Passing ${mailboxes.length} mailboxes to Phase 3 for sequence assignment`);

return [{
  json: {
    task_id: config.task_id,
    custom_fields_spec: config.custom_fields_spec,
    stages_spec: config.stages_spec,
    sequence_template_ids: config.sequence_template_ids,
    force_overwrite: config.force_overwrite,
    mailboxes: mailboxes
  }
}];
