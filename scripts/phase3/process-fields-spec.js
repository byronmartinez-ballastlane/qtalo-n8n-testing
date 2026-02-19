const config = $('Start').first().json;
const existingFieldsResponse = $input.first().json || [];
const taskId = config.task_id;

if (existingFieldsResponse.error || existingFieldsResponse.statusCode === 401 || existingFieldsResponse.statusCode === 403 || 
    existingFieldsResponse.message?.includes('Unauthorized') || existingFieldsResponse.message?.includes('Forbidden')) {
  
  const errorMsg = existingFieldsResponse.error?.message || existingFieldsResponse.message || existingFieldsResponse.error || 'Authentication failed';
  const statusCode = existingFieldsResponse.statusCode || existingFieldsResponse.error?.statusCode || 'unknown';
  
  console.error(`❌ Reply.io Auth Error (${statusCode}): ${errorMsg}`);
  
  if (taskId && taskId !== 'unknown') {
    try {
      await this.helpers.request({
        method: 'POST',
        uri: `https://api.clickup.com/api/v2/task/${taskId}/comment`,
        headers: {
          'Authorization': HARDCODED_CLICKUP_API_KEY,
          'Content-Type': 'application/json'
        },
        body: {
          comment_text: `🚨 **Authentication Error - Reply.io API (Phase 3)**\n\n**Error Code:** ${statusCode}\n**Message:** ${errorMsg}\n\n**Action Required:**\n1. Verify the Reply.io API key is valid\n2. Check if the API key has the correct permissions\n3. Update the API key in the n8n workflow\n\n**API Endpoint:** GET /v1/custom-fields/all\n**Current API Key (last 8 chars):** ...${HARDCODED_REPLY_API_KEY.slice(-8)}`
        },
        json: true
      });
      console.log('✅ Posted Reply.io auth error comment to ClickUp');
    } catch (commentError) {
      console.error('Failed to post error comment:', commentError.message);
    }
  }
  
  throw new Error(`Reply.io API authentication failed (${statusCode}): ${errorMsg}. Please update credentials.`);
}

const existingFields = Array.isArray(existingFieldsResponse) ? existingFieldsResponse : [];

let customFieldsSpec = config.custom_fields_spec || [];
if (!Array.isArray(customFieldsSpec)) {
  customFieldsSpec = [];
}

const hasLeadStage = customFieldsSpec.some(f => 
  f.name && f.name.toLowerCase() === 'lead stage'
);

if (!hasLeadStage) {
  console.log('✅ Auto-adding standard "Lead Stage" custom field');
  customFieldsSpec.push({
    name: 'Lead Stage',
    type: 'text'
  });
}

const existingByTitle = {};
if (Array.isArray(existingFields)) {
  existingFields.forEach(field => {
    if (field.title) {
      existingByTitle[field.title.toLowerCase()] = field;
    }
  });
}

const mapFieldType = (type) => {
  const t = String(type).toLowerCase();
  return t === 'number' ? 1 : 0;
};

const fieldsToCreate = [];
const fieldsToSkip = [];

customFieldsSpec.forEach(specField => {
  const fieldTitle = specField.name;
  const fieldType = mapFieldType(specField.type || 'text');
  const existing = existingByTitle[fieldTitle.toLowerCase()];
  
  if (!existing) {
    fieldsToCreate.push({
      title: fieldTitle,
      type: fieldType
    });
  } else {
    fieldsToSkip.push({
      title: fieldTitle,
      type: fieldType,
      id: existing.id,
      reason: 'already exists'
    });
  }
});

if (fieldsToCreate.length === 0 && fieldsToSkip.length === 0) {
  return [{
    json: {
      task_id: config.task_id,
      action: 'skip',
      message: 'No custom fields to process',
      fields_to_create: [],
      fields_to_skip: []
    }
  }];
}

return [{
  json: {
    task_id: config.task_id,
    fields_to_create: fieldsToCreate,
    fields_to_skip: fieldsToSkip
  }
}];
