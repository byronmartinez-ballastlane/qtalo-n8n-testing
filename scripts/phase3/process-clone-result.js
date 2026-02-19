const prepData = $('Prepare Clone Payload').item.json;
const apiResponse = $input.item.json;

if (apiResponse.error || !apiResponse.id) {
  return {
    json: {
      source_sequence_id: prepData.source_sequence_id,
      mailbox_id: prepData.mailbox_id,
      mailbox_email: prepData.mailbox_email,
      sequence_name: prepData.sequence_name,
      status: 'failed',
      steps_cloned: 0,
      error: apiResponse.error?.message || apiResponse.message || 'API call failed'
    }
  };
}

return {
  json: {
    source_sequence_id: prepData.source_sequence_id,
    mailbox_id: prepData.mailbox_id,
    mailbox_email: prepData.mailbox_email,
    sequence_name: prepData.sequence_name,
    cloned_id: apiResponse.id,
    cloned_name: prepData.cloned_name,
    status: 'created',
    steps_cloned: prepData.steps_count,
    error: ''
  }
};
