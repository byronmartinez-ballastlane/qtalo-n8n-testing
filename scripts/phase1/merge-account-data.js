const apiResponses = $input.all();
const originalMailboxes = $('Skip?', 1).all();

const results = apiResponses.map((apiItem, index) => {
  const apiResponse = apiItem.json;
  const originalData = originalMailboxes[index] ? originalMailboxes[index].json : {};
  
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
      ...originalData,
      id: apiResponse.id || apiResponse.emailAccountId,
      created: !!apiResponse.id,
      action: 'created',
      api_response: apiResponse
    }
  };
});

return results;
