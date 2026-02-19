const task = $input.first().json;
const customFields = task.custom_fields || [];

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const getFieldByName = (name) => {
  const field = customFields.find(f => 
    f.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return field?.value || '';
};

const getFieldIdByName = (name) => {
  const field = customFields.find(f => 
    f.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return field?.id || '';
};

const companyName = getFieldByName('company_name');
const companyUrl = getFieldByName('company_url');
const replyApiKey = getFieldByName('Reply API Key');
const replyUser = getFieldByName('Reply User');
const replyPassword = getFieldByName('Reply Password');
const clickupApiKey = getFieldByName('Client ClickUp API Key');
const replyWorkspaceId = getFieldByName('reply_workspace_id');
const clientIdFieldId = getFieldIdByName('Client ID');

if (!replyApiKey || !replyUser || !replyPassword || !clickupApiKey) {
  throw new Error(`Missing required fields. Found: Reply API Key=${!!replyApiKey}, Reply User=${!!replyUser}, Reply Password=${!!replyPassword}, Client ClickUp API Key=${!!clickupApiKey}`);
}

const clientId = generateUUID();

function parseDomain(url) {
  if (!url) return null;
  let domain = url.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.split('/')[0];
  domain = domain.split('?')[0];
  domain = domain.split('#')[0];
  domain = domain.split(':')[0];
  return domain || null;
}

const expectedDomain = parseDomain(companyUrl);
const expectedDomains = expectedDomain ? [expectedDomain] : [];

console.log('🆔 Generated client_id:', clientId);
console.log('🌐 Company URL:', companyUrl, '→ Domain:', expectedDomain);
console.log('🔒 Task-level domain hint:', JSON.stringify(expectedDomains));
console.log('ℹ️ Full multi-domain list will be derived from CSV when orchestrator runs.');

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