// Extract custom fields from ClickUp task
const task = $input.first().json;
const customFields = task.custom_fields || [];

// UUID v4 generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Extract field value by NAME (case-insensitive) - works across all tasks/lists
const getFieldByName = (name) => {
  const field = customFields.find(f => 
    f.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return field?.value || '';
};

// Get field ID by name for later updates
const getFieldIdByName = (name) => {
  const field = customFields.find(f => 
    f.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return field?.id || '';
};

// Extract values by field NAME
const companyName = getFieldByName('company_name');
const companyUrl = getFieldByName('company_url');
const replyApiKey = getFieldByName('Reply API Key');
const replyUser = getFieldByName('Reply User');
const replyPassword = getFieldByName('Reply Password');
const clickupApiKey = getFieldByName('Client ClickUp API Key');
const replyWorkspaceId = getFieldByName('reply_workspace_id');
const clientIdFieldId = getFieldIdByName('Client ID');

// Validate required fields
if (!replyApiKey || !replyUser || !replyPassword || !clickupApiKey) {
  throw new Error(`Missing required fields. Found: Reply API Key=${!!replyApiKey}, Reply User=${!!replyUser}, Reply Password=${!!replyPassword}, Client ClickUp API Key=${!!clickupApiKey}`);
}

// Generate client_id
const clientId = generateUUID();

// Parse domain from company_url
// Input: www.n8n-testing.com, https://www.example.com/path
// Output: n8n-testing.com, example.com
function parseDomain(url) {
  if (!url) return null;
  let domain = url.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, ''); // Remove protocol
  domain = domain.replace(/^www\./, '');        // Remove www.
  domain = domain.split('/')[0];                // Remove path
  domain = domain.split('?')[0];                // Remove query
  domain = domain.split('#')[0];                // Remove hash
  domain = domain.split(':')[0];                // Remove port
  return domain || null;
}

const expectedDomain = parseDomain(companyUrl);
const expectedDomains = expectedDomain ? [expectedDomain] : [];

console.log('🆔 Generated client_id:', clientId);
console.log('🌐 Company URL:', companyUrl, '→ Domain:', expectedDomain);
console.log('🔒 Expected domains:', JSON.stringify(expectedDomains));

return {
  json: {
    client_id: clientId,
    client_id_field_id: clientIdFieldId,
    client_name: companyName || task.name || clientId,
    company_url: companyUrl,
    expected_domains: expectedDomains,
    reply_api_key: replyApiKey,
    reply_io_user: replyUser,
    reply_io_password: replyPassword,
    clickup_api_key: clickupApiKey,
    reply_workspace_id: replyWorkspaceId,
    clickup_task_id: task.id,
    github_owner: '{{GITHUB_OWNER}}',
    github_repo: '{{GITHUB_REPO}}',
    templates_path: 'templates'
  }
};