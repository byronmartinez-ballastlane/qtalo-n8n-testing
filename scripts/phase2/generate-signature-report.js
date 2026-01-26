// Phase 2 simplified: Just generate signature text for reporting for ALL items
// Reply.io API doesn't support setting signatures via API
// Signatures must be set manually in Reply.io UI

const items = $input.all();

return items.map(item => {
  const data = item.json;
  
  return {
    json: {
      email: data.email,
      senderName: data.senderName,
      signature: data.signature,
      opt_out_line: data.opt_out_line,
      status: 'success',
      message: 'Signature generated (manual setup required in Reply.io UI)',
      timestamp: new Date().toISOString()
    }
  };
});
