const startData = $('Start').first().json;

const executionData = startData.inputData ? JSON.parse(startData.inputData) : startData;
const taskId = executionData.task_id;

const allItems = $input.all();
console.log(`Received ${allItems.length} items from previous node`);

const firstResponse = allItems[0]?.json || {};
if (firstResponse.error || firstResponse.statusCode === 401 || firstResponse.statusCode === 403 || 
    firstResponse.message?.includes('Unauthorized') || firstResponse.message?.includes('Forbidden')) {
  
  const errorMsg = firstResponse.error?.message || firstResponse.message || firstResponse.error || 'Authentication failed';
  const statusCode = firstResponse.statusCode || firstResponse.error?.statusCode || 'unknown';
  
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
          comment_text: `🚨 **Authentication Error - Reply.io API (Phase 2)**\n\n**Error Code:** ${statusCode}\n**Message:** ${errorMsg}\n\n**Action Required:**\n1. Verify the Reply.io API key is valid\n2. Check if the API key has the correct permissions\n3. Update the API key in the n8n workflow\n\n**API Endpoint:** GET /v1/emailAccounts\n**Current API Key (last 8 chars):** ...${HARDCODED_REPLY_API_KEY.slice(-8)}`
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

const config = {
  client_id: executionData.client_id || executionData.config?.client_id || null,
  signature_template_plain: executionData.signature_template_plain || executionData.config?.signature_template_plain || '{{first_name}}',
  opt_out_variants: executionData.opt_out_variants || executionData.config?.opt_out_variants || [
    "If you're ready to move on from my emails, just reply.",
    "Not interested? Let me know.",
    "Reply to unsubscribe."
  ],
  company_name: executionData.company_name || executionData.config?.company_name || '',
  company_url: executionData.company_url || executionData.config?.company_url || '',
  company_phone: executionData.company_phone || executionData.config?.company_phone || '',
  force_overwrite: executionData.force_overwrite !== undefined ? executionData.force_overwrite : (executionData.config?.force_overwrite !== undefined ? executionData.config.force_overwrite : false),
  task_id: taskId,
  expected_domains: executionData.expected_domains || executionData.config?.expected_domains || [],
  reply_workspace_id: executionData.reply_workspace_id || executionData.config?.reply_workspace_id || null
};

console.log(`🏢 Reply.io workspace: ${config.reply_workspace_id || 'DEFAULT (not set)'}`);

let mailboxes = allItems.map(item => item.json);
let source = 'api';

console.log(`Processing ${mailboxes.length} mailboxes from API response`);

const expectedDomains = config.expected_domains;
let filteredMailboxes = mailboxes;
let rejectedMailboxes = [];

if (expectedDomains && expectedDomains.length > 0) {
  const normalizedDomains = expectedDomains.map(d => d.toLowerCase().trim());
  console.log(`🔒 DOMAIN FILTER: Processing mailboxes for ${normalizedDomains.length} domain(s): ${normalizedDomains.join(', ')}`);
  
  filteredMailboxes = [];
  rejectedMailboxes = [];
  
  for (const mailbox of mailboxes) {
    const email = mailbox.emailAddress || mailbox.email || '';
    const domain = email.split('@')[1]?.toLowerCase().trim() || '';
    
    if (normalizedDomains.includes(domain)) {
      filteredMailboxes.push(mailbox);
      console.log(`✅ APPROVED: ${email} (domain: ${domain})`);
    } else {
      rejectedMailboxes.push({ ...mailbox, rejectionReason: `Domain '${domain}' not in expected_domains` });
      console.log(`❌ REJECTED: ${email} (domain: ${domain} not in ${normalizedDomains.join(', ')})`);
    }
  }
  
  console.log(`🔒 Domain filter results: ${filteredMailboxes.length} approved, ${rejectedMailboxes.length} rejected out of ${mailboxes.length} total`);
  
  if (filteredMailboxes.length === 0 && mailboxes.length > 0) {
    const errorMsg = `🚨 SECURITY BLOCK: All ${mailboxes.length} mailboxes rejected by domain filter. Expected domains: ${normalizedDomains.join(', ')}. This may indicate misconfiguration or an attempt to process unauthorized mailboxes.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
} else {
  console.log('ℹ️ No expected_domains configured — processing ALL mailboxes (domains will be derived from mailbox list).');
}

if (filteredMailboxes.length === 0) {
  return [{ json: { error: 'No mailboxes found to process after domain filtering', config, source, rejected_count: rejectedMailboxes.length } }];
}

const phase1Results = executionData.phase1_results || [];

return filteredMailboxes.map(mailbox => {
  const phase1Match = phase1Results.find(p => 
    p.email && mailbox.emailAddress && p.email.toLowerCase() === mailbox.emailAddress.toLowerCase()
  );
  
  return {
    json: {
      ...mailbox,
      displayName: phase1Match?.displayName || mailbox.senderName,
      config,
      _source: source,
      _domainValidation: {
        totalFromApi: mailboxes.length,
        approved: filteredMailboxes.length,
        rejected: rejectedMailboxes.length,
        expectedDomains: expectedDomains
      }
    }
  };
});
