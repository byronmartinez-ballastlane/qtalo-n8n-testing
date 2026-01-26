// Process sequences spec - create sequence × mailbox combinations
const data = $input.first().json;
const existingSequences = data.campaigns || data || [];
const config = $('Check Sequences Spec').first().json;
const sequenceIds = config.sequence_template_ids || [];
const mailboxes = config.mailboxes || [];
const forceOverwrite = config.force_overwrite;

// Build map of existing sequences by name
const existingByName = {};
if (Array.isArray(existingSequences)) {
  existingSequences.forEach(seq => {
    if (seq.name) {
      existingByName[seq.name.toLowerCase()] = seq;
    }
  });
}

// Create cross-product: one clone per sequence × mailbox combination
const sequencesToClone = [];
const sequencesToSkip = [];

sequenceIds.forEach(sourceId => {
  mailboxes.forEach(mailbox => {
    sequencesToClone.push({
      source_id: sourceId,
      mailbox_id: mailbox.id,
      mailbox_email: mailbox.email,
      force_overwrite: forceOverwrite
    });
  });
});

console.log(`Created ${sequencesToClone.length} sequence×mailbox combinations to clone`);

return [{
  json: {
    task_id: config.task_id,
    sequences_to_clone: sequencesToClone,
    sequences_to_skip: sequencesToSkip,
    existing_sequences: existingByName
  }
}];
