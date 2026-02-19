const apiResponses = $input.all();
const originalMailboxes = $('Should Update?', 0).all();

const results = apiResponses.map((apiItem, index) => {
  const apiResponse = apiItem.json;
  const originalData = originalMailboxes[index] ? originalMailboxes[index].json : {};
  
  console.log('=== UPDATE RESPONSE ===');
  console.log('Email:', originalData.email);
  console.log('Response ID:', apiResponse.id);
  console.log('=======================');
  
  return {
    json: {
      ...originalData,
      id: apiResponse.id || originalData.existingMailboxId,
      updated: !!apiResponse.id,
      action: 'updated',
      api_response: apiResponse
    }
  };
});

return results;
