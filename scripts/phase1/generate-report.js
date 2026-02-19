const items = $input.all();

const results = items.map(item => {
  const data = item.json;
  
  let status, action, error;
  
  if (data.action) {
    action = data.action;
    status = (action === 'skipped') ? 'skipped' : 'success';
    error = (action === 'skipped') ? 'Already exists, no changes needed' : '';
  } else if (data.error) {
    status = 'error';
    action = 'failed';
    error = data.error;
  } else if (data.id || data.emailAccountId) {
    status = 'success';
    action = data.created ? 'created' : (data.updated ? 'updated' : 'unknown');
    if (data.retried && data.retry_successful) {
      action = 'created (retry)';
    }
    error = '';
  } else {
    status = 'unknown';
    action = 'unknown';
    error = data.api_response?.error?.message || 'Unexpected response';
  }
  
  const limitsError = data.limits_error === 'Endpoint not available' ? '' : (data.limits_error || '');
  
  return {
    json: {
      email: data.email,
      status,
      action,
      displayName: data.display_name || data.displayName,
      limits_applied: data.limits_applied || false,
      limits_error: limitsError,
      error,
      retried: data.retried || false,
      timestamp: new Date().toISOString()
    }
  };
});

return results;
