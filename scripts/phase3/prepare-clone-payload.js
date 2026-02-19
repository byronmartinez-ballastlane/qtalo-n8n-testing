const campaignData = $input.item.json;
const originalData = $('Split Sequences to Clone').item.json;
const existingSequences = originalData.existing_sequences || {};

const mailboxId = originalData.mailbox_id;
const mailboxEmail = originalData.mailbox_email;

if (campaignData.error || !campaignData.id) {
  return {
    json: {
      source_sequence_id: originalData.source_sequence_id,
      mailbox_id: mailboxId,
      mailbox_email: mailboxEmail,
      sequence_name: 'unknown',
      status: 'failed',
      steps_cloned: 0,
      error: campaignData.error?.message || 'Failed to fetch source sequence',
      _skipApiCall: true
    }
  };
}

const sourceName = campaignData.name || 'Unnamed Sequence';
const clonedName = `Clone - ${mailboxEmail}`;
const forceOverwrite = originalData.force_overwrite;

const existing = existingSequences[clonedName.toLowerCase()];
if (existing && !forceOverwrite) {
  return {
    json: {
      source_sequence_id: originalData.source_sequence_id,
      mailbox_id: mailboxId,
      mailbox_email: mailboxEmail,
      sequence_name: sourceName,
      status: 'skipped',
      steps_cloned: 0,
      error: 'already exists (force_overwrite=false)',
      _skipApiCall: true
    }
  };
}

const steps = campaignData.steps || [];

return {
  json: {
    source_sequence_id: originalData.source_sequence_id,
    mailbox_id: mailboxId,
    mailbox_email: mailboxEmail,
    sequence_name: sourceName,
    cloned_name: clonedName,
    steps_count: steps.length,
    _skipApiCall: false,
    _payload: {
      name: clonedName,
      emailAccount: mailboxEmail,
      settings: campaignData.settings || {},
      steps: steps.map((step, index) => ({
        number: index + 1,
        inMinutesCount: step.inMinutesCount || 0,
        templates: step.templates || []
      }))
    }
  }
};
