// Parse Lambda webhook results and match to original items
// Wait node receives Lambda GET request with query params
const webhookData = $input.first().json;
const triggerData = $('Prepare Lambda Request').first().json;
const originalItems = triggerData._originalItems || [];

console.log('Webhook data received:', JSON.stringify(webhookData, null, 2));

// Wait node puts query parameters in webhookData.query
// Lambda sends: ?status=completed&timestamp=...&result={"statusCode":200,"body":"{\"results\":[...]}"}
let lambdaResults = [];

// Check webhookData.query.result (GET query parameters)
if (webhookData.query && webhookData.query.result) {
  try {
    // First parse: query.result -> {statusCode, body}
    const lambdaResponse = typeof webhookData.query.result === 'string' 
      ? JSON.parse(webhookData.query.result) 
      : webhookData.query.result;
    
    console.log('Lambda response statusCode:', lambdaResponse.statusCode);
    
    // Second parse: body -> {results: [...]}
    const bodyData = typeof lambdaResponse.body === 'string'
      ? JSON.parse(lambdaResponse.body)
      : lambdaResponse.body;
    
    lambdaResults = bodyData.results || [];
    console.log(`✅ Parsed Lambda results for ${lambdaResults.length} accounts`);
  } catch (error) {
    console.error('❌ Failed to parse Lambda result:', error);
    console.error('Error details:', error.message);
  }
} else {
  console.error('❌ No query.result found in webhook data');
  console.log('Available keys:', Object.keys(webhookData));
  if (webhookData.query) {
    console.log('Query keys:', Object.keys(webhookData.query));
  }
}

// Match Lambda results to original items by email
const results = originalItems.map(item => {
  const lambdaResult = lambdaResults.find(r => r.email === item.email) || {};
  
  return {
    json: {
      email: item.email,
      status: lambdaResult.success ? 'success' : 'error',
      signatureApplied: lambdaResult.success || false,
      optOutApplied: lambdaResult.success || false,
      generatedSignature: item.signature || '',
      optOutLine: item.opt_out_line || '',
      error: lambdaResult.success ? '' : (lambdaResult.error || 'Lambda update failed'),
      verification: lambdaResult.verification || null,
      timestamp: new Date().toISOString()
    }
  };
});

return results;
