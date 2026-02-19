const retryResponses = $input.all();
const failedMailboxes = $('Detect Failed Creations', 1).all();

const results = retryResponses.map((retryItem, index) => {
  const retryResponse = retryItem.json;
  const originalData = failedMailboxes[index] ? failedMailboxes[index].json : {};
  
  console.log('=== RETRY ATTEMPT RESPONSE ===');
  console.log('Email:', originalData.email);
  console.log('Retry Response:', JSON.stringify(retryResponse, null, 2));
  console.log('Retry Successful:', !!retryResponse.id);
  if (retryResponse.error) {
    console.log('Retry Error Status:', retryResponse.error.status);
    console.log('Retry Error Message:', retryResponse.error.message);
  }
  console.log('==============================');
  
  return {
    json: {
      ...originalData,
      id: retryResponse.id || retryResponse.emailAccountId,
      created: !!retryResponse.id,
      api_response: retryResponse,
      retried: true,
      retry_successful: !!retryResponse.id
    }
  };
});

return results;
