// Check if sequences spec exists and mailboxes are available
const config = $('Start').first().json;
const sequenceIds = config.sequence_template_ids || [];
const mailboxes = config.mailboxes || [];

if (!Array.isArray(sequenceIds) || sequenceIds.length === 0) {
  // No sequences to process - return empty to skip this branch
  console.log('No sequence_template_ids provided - skipping sequence cloning');
  return [];
}

if (!Array.isArray(mailboxes) || mailboxes.length === 0) {
  console.log('No mailboxes provided - cannot assign sequences');
  return [];
}

console.log(`Will clone ${sequenceIds.length} sequence(s) for ${mailboxes.length} mailbox(es) = ${sequenceIds.length * mailboxes.length} total clones`);

return [{
  json: {
    task_id: config.task_id,
    sequence_template_ids: sequenceIds,
    mailboxes: mailboxes,
    force_overwrite: config.force_overwrite || false
  }
}];
