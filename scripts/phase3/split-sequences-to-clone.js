// Split sequence×mailbox combinations into individual items
const data = $input.first().json;
const sequencesToClone = data.sequences_to_clone || [];

if (sequencesToClone.length === 0) {
  return [];
}

return sequencesToClone.map(seq => ({
  json: {
    task_id: data.task_id,
    source_sequence_id: seq.source_id,
    mailbox_id: seq.mailbox_id,
    mailbox_email: seq.mailbox_email,
    force_overwrite: seq.force_overwrite,
    existing_sequences: data.existing_sequences,
    sequences_to_skip: data.sequences_to_skip || []
  }
}));
