const limitsResponses = $input.all();
const mailboxes = $('Prepare Sending Limits').all();

const results = limitsResponses.map((limitsItem, index) => {
  const limitsResponse = limitsItem.json;
  const mailboxData = mailboxes[index] ? mailboxes[index].json : {};
  
  let limitsApplied = false;
  let limitsError = '';
  
  if (limitsResponse.error) {
    const errorStr = typeof limitsResponse.error === 'string' ? limitsResponse.error : JSON.stringify(limitsResponse.error);
    limitsError = errorStr;
    if (errorStr.includes('404')) {
      limitsError = 'Endpoint not available';
    }
    else if (errorStr.includes('401') || errorStr.includes('403')) {
      limitsError = '🔒 Authentication failed - Please update Reply.io API key in ClickUp';
    } else if (errorStr.includes('429')) {
      limitsError = '⏱️ Rate limit exceeded - Retries exhausted';
    }
  } else if (limitsResponse.statusCode && limitsResponse.statusCode >= 200 && limitsResponse.statusCode < 300) {
    limitsApplied = true;
  }
  
  return {
    json: {
      ...mailboxData,
      limits_applied: limitsApplied,
      limits_error: limitsError
    }
  };
});

return results;
