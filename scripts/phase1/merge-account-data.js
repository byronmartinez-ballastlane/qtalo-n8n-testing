// Merge Create Email Account API response with original mailbox data
const apiResponses = $input.all();
const originalMailboxes = $('Skip?', 1).all(); // Get data from Skip? node's output 1 (create path)

const results = apiResponses.map((apiItem, index) => {
  const apiResponse = apiItem.json;
  const originalData = originalMailboxes[index] ? originalMailboxes[index].json : {};
  
  // LOG FULL API RESPONSE FOR DEBUGGING
  console.log('=== REPLY.IO API RESPONSE ===' );
  console.log('Email:', originalData.email);
  console.log('Full Response:', JSON.stringify(apiResponse, null, 2));
  console.log('Has ID:', !!apiResponse.id);
  console.log('Has Error:', !!apiResponse.error);
  if (apiResponse.error) {
    console.log('Error Status:', apiResponse.error.status);
    console.log('Error Message:', apiResponse.error.message);
    console.log('Error Stack:', apiResponse.error.stack?.substring(0, 200));
  }
  console.log('==============================');
  
  return {
    json: {
      ...originalData, // Keep all original mailbox data
      id: apiResponse.id || apiResponse.emailAccountId,
      created: !!apiResponse.id, // If ID exists in response, it was created
      action: 'created',
      api_response: apiResponse
    }
  };
});

return results;
