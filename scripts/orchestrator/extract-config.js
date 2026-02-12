// Extract custom fields and prepare configuration with resilient defaults
// CRITICAL: Includes expected_domains for multi-tenancy isolation
const task = $input.first().json;
const customFields = task.custom_fields || [];

// Helper to get field value
function getFieldValue(fields, fieldName) {
  const field = fields.find(f => f.name === fieldName);
  return field?.value || '';
}

// Parse JSON fields safely
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Extract domain from task name or use default
const taskName = task.name || 'Test Company';
const domainMatch = taskName.match(/([a-z0-9-]+\.[a-z]{2,})/i);
const extractedDomain = domainMatch ? domainMatch[1] : null;
const defaultCompanyName = taskName.split(/[\s-]/)[0] || 'TestCompany';

// Get company_url first (needed for domain extraction fallback)
const companyUrl = getFieldValue(customFields, 'company_url') || '';

// Get Domain custom field (explicit domain setting)
const domainField = getFieldValue(customFields, 'Domain') || getFieldValue(customFields, 'domain') || '';

// Parse domain from company_url
function parseDomainFromUrl(url) {
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

const domainFromUrl = parseDomainFromUrl(companyUrl);

// CRITICAL: Get expected_domains with priority fallbacks
// NOTE: This extracts the TASK-LEVEL domain hint only (single domain).
// The actual multi-domain list is built in combine-data.js by extracting
// all unique domains from the CSV and reconciling with this task domain.
// Priority 1: Domain custom field (single domain)
let expectedDomains = [];
if (domainField) {
  const parsedDomain = parseDomainFromUrl(domainField); // Clean it in case it has www. or protocol
  if (parsedDomain) {
    expectedDomains = [parsedDomain];
    console.log(`✅ Using Domain custom field as task domain hint: ${parsedDomain}`);
  }
}

// Priority 2: Parse from company_url
if (expectedDomains.length === 0 && domainFromUrl) {
  expectedDomains = [domainFromUrl];
  console.log(`⚠️ No Domain field - auto-extracted task domain hint from company_url: ${domainFromUrl}`);
}

// Priority 3: Extract from task name
if (expectedDomains.length === 0 && extractedDomain) {
  expectedDomains = [extractedDomain];
  console.log(`⚠️ No Domain field or company_url - auto-extracted task domain hint from task name: ${extractedDomain}`);
}

// Log info - this is just the task-level hint, combine-data.js will build the final list from CSV
if (!expectedDomains || expectedDomains.length === 0) {
  console.log('ℹ️ No task-level domain hint configured. Domains will be extracted from CSV in combine-data step.');
}

// Extract configuration with fallbacks
const config = {
  // CLIENT ID: Required for multi-tenant AWS API access
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
  // SENDING SCHEDULE: Time windows for when emails can be sent (Reply.io Schedules API)
  sending_schedule: parseJsonField(getFieldValue(customFields, 'sending_schedule')) || null,
  stages_spec: parseJsonField(getFieldValue(customFields, 'stages_spec')) || null,
  custom_fields_spec: parseJsonField(getFieldValue(customFields, 'custom_fields_spec')) || null,
  sequence_template_ids: parseJsonField(getFieldValue(customFields, 'sequence_template_ids')) || [],
  reply_user_invites: parseJsonField(getFieldValue(customFields, 'reply_user_invites')) || [],
  // CRITICAL: Expected domains for multi-tenancy isolation
  expected_domains: expectedDomains,
  attachments: task.attachments || []
};

console.log(`🔒 Task-level domain hint: ${config.expected_domains.join(', ') || 'NONE (will be derived from CSV)'}`);

// Find CSV attachment
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

// Find opt-out attachment
const optOutAttachment = config.attachments.find(a => 
  a.title?.toLowerCase().includes('opt') || 
  a.title?.toLowerCase().includes('unsubscribe')
);

config.csv_attachment_url = csvAttachment?.url || '';
config.optout_attachment_url = optOutAttachment?.url || '';
config.phase2_webhook_id = 'phase2-signatures';

return [{ json: config }];
