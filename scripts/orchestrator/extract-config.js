const task = $input.first().json;
const customFields = task.custom_fields || [];

function getFieldValue(fields, fieldName) {
  const field = fields.find(f => f.name === fieldName);
  return field?.value || '';
}

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const taskName = task.name || 'Test Company';
const domainMatch = taskName.match(/([a-z0-9-]+\.[a-z]{2,})/i);
const extractedDomain = domainMatch ? domainMatch[1] : null;
const defaultCompanyName = taskName.split(/[\s-]/)[0] || 'TestCompany';

const companyUrl = getFieldValue(customFields, 'company_url') || '';

const domainField = getFieldValue(customFields, 'Domain') || getFieldValue(customFields, 'domain') || '';

function parseDomainFromUrl(url) {
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

const domainFromUrl = parseDomainFromUrl(companyUrl);

let expectedDomains = [];
if (domainField) {
  const parsedDomain = parseDomainFromUrl(domainField);
  if (parsedDomain) {
    expectedDomains = [parsedDomain];
    console.log(`✅ Using Domain custom field as task domain hint: ${parsedDomain}`);
  }
}

if (expectedDomains.length === 0 && domainFromUrl) {
  expectedDomains = [domainFromUrl];
  console.log(`⚠️ No Domain field - auto-extracted task domain hint from company_url: ${domainFromUrl}`);
}

if (expectedDomains.length === 0 && extractedDomain) {
  expectedDomains = [extractedDomain];
  console.log(`⚠️ No Domain field or company_url - auto-extracted task domain hint from task name: ${extractedDomain}`);
}

if (!expectedDomains || expectedDomains.length === 0) {
  console.log('ℹ️ No task-level domain hint configured. Domains will be extracted from CSV in combine-data step.');
}

const config = {
  client_id: '{{CLIENT_ID}}',
  task_id: task.id,
  task_name: taskName,
  company_name: getFieldValue(customFields, 'company_name') || defaultCompanyName,
  company_url: companyUrl || (extractedDomain ? `https://${extractedDomain}` : ''),
  reply_workspace_id: getFieldValue(customFields, 'reply_workspace_id') || `workspace-${task.id}`,
  force_overwrite: getFieldValue(customFields, 'force_overwrite') === true || false,
  signature_template_plain: getFieldValue(customFields, 'signature_template_plain') || 'Regards,\n{{first_name}} @ {{company_name}}\nBusiness Development Manager\n{{company_url}}\n{{domain}}',
  opt_out_variants: parseJsonField(getFieldValue(customFields, 'opt_out_variants')) || null,
  sending_limits: parseJsonField(getFieldValue(customFields, 'sending_limits')) || { daily: 50, hourly: 10 },
  sending_schedule: parseJsonField(getFieldValue(customFields, 'sending_schedule')) || null,
  stages_spec: parseJsonField(getFieldValue(customFields, 'stages_spec')) || null,
  custom_fields_spec: parseJsonField(getFieldValue(customFields, 'custom_fields_spec')) || null,
  sequence_template_ids: parseJsonField(getFieldValue(customFields, 'sequence_template_ids')) || [],
  reply_user_invites: parseJsonField(getFieldValue(customFields, 'reply_user_invites')) || [],
  expected_domains: expectedDomains,
  attachments: task.attachments || []
};

console.log(`🔒 Task-level domain hint: ${config.expected_domains.join(', ') || 'NONE (will be derived from CSV)'}`);

const csvAttachment = config.attachments.find(a => 
  a.title?.toLowerCase() === 'sample-mailboxes.csv'
) || config.attachments.find(a => 
  a.title?.toLowerCase().includes('mailbox') && !a.title?.toLowerCase().includes('phase')
) || config.attachments.find(a => 
  a.title?.toLowerCase().includes('roster')
) || config.attachments.find(a => 
  a.title?.toLowerCase().endsWith('.csv') && 
  !a.title?.toLowerCase().includes('phase1') && 
  !a.title?.toLowerCase().includes('phase2') &&
  !a.title?.toLowerCase().includes('phase3') &&
  !a.title?.toLowerCase().includes('signature') &&
  !a.title?.toLowerCase().includes('hygiene')
);

const optOutAttachment = config.attachments.find(a => 
  a.title?.toLowerCase().includes('opt') || 
  a.title?.toLowerCase().includes('unsubscribe')
);

config.csv_attachment_url = csvAttachment?.url || '';
config.optout_attachment_url = optOutAttachment?.url || '';
config.phase2_webhook_id = 'phase2-signatures';

return [{ json: config }];
