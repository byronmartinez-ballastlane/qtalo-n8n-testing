const items = $input.all();

const results = items.map(item => {
  const data = item.json;
  
  return {
    json: {
      email: data.email || data.emailAddress,
      status: data.error ? 'error' : data.skipped ? 'skipped' : 'success',
      signatureApplied: !data.skipped && !data.error,
      optOutApplied: !data.skipped && !data.error,
      generatedSignature: data.generatedSignature || data.signature || '',
      optOutLine: data.optOutLine || data.opt_out_line || '',
      error: data.error || (data.skipped ? 'Already has signature, force_overwrite=false' : ''),
      timestamp: new Date().toISOString()
    }
  };
});

return results;
