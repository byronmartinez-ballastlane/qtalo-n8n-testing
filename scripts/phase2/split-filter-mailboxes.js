// Split mailboxes array into individual items
// PRIORITY: Use API response (has IDs) and merge with Phase 1 config if available
// CRITICAL: Filter by expected_domains to prevent cross-client data contamination!
const startData = $('Start').first().json;

// Check if data was passed via workflow fields
const executionData = startData.inputData ? JSON.parse(startData.inputData) : startData;
const taskId = executionData.task_id;

// Use $input.all() to get ALL items from previous node
const allItems = $input.all();
console.log(`Received ${allItems.length} items from previous node`);

// ============================================================
// CHECK FOR REPLY.IO AUTH ERRORS (401/403)
// ============================================================
const firstResponse = allItems[0]?.json || {};
if (firstResponse.error || firstResponse.statusCode === 401 || firstResponse.statusCode === 403 || 
    firstResponse.message?.includes('Unauthorized') || firstResponse.message?.includes('Forbidden')) {
  
  const errorMsg = firstResponse.error?.message || firstResponse.message || firstResponse.error || 'Authentication failed';
  const statusCode = firstResponse.statusCode || firstResponse.error?.statusCode || 'unknown';
  
  console.error(`❌ Reply.io Auth Error (${statusCode}): ${errorMsg}`);
  
  // Try to post error comment to ClickUp
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
// ============================================================

// Get config from Start node input (passed from orchestrator) or use defaults
// Note: $env vars removed for n8n Cloud compatibility
const config = {
  // CLIENT ID: Required for multi-tenant AWS API access
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
  // CRITICAL: Expected domains for multi-tenancy isolation
  expected_domains: executionData.expected_domains || executionData.config?.expected_domains || [],
  // WORKSPACE SWITCHING: Reply.io workspace name for the Lambda to switch to
  reply_workspace_id: executionData.reply_workspace_id || executionData.config?.reply_workspace_id || null
};

console.log(`🏢 Reply.io workspace: ${config.reply_workspace_id || 'DEFAULT (not set)'}`);

// Handle different response structures:
// API response returns array of mailbox objects, each item has the structure
let mailboxes = allItems.map(item => item.json);
let source = 'api';

console.log(`Processing ${mailboxes.length} mailboxes from API response`);

// ============================================================
// MULTI-TENANCY DOMAIN FILTERING - CRITICAL SECURITY CHECK
// ============================================================
const expectedDomains = config.expected_domains;
let filteredMailboxes = mailboxes;
let rejectedMailboxes = [];

if (expectedDomains && expectedDomains.length > 0) {
  const normalizedDomains = expectedDomains.map(d => d.toLowerCase().trim());
  console.log(`🔒 DOMAIN FILTER: Only processing mailboxes for domains: ${normalizedDomains.join(', ')}`);
  
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
  
  console.log(`🔒 Domain filter results: ${filteredMailboxes.length} approved, ${rejectedMailboxes.length} rejected`);
  
  // SECURITY: Block execution if ALL mailboxes were rejected
  if (filteredMailboxes.length === 0 && mailboxes.length > 0) {
    const errorMsg = `🚨 SECURITY BLOCK: All ${mailboxes.length} mailboxes rejected by domain filter. Expected domains: ${normalizedDomains.join(', ')}. This may indicate misconfiguration or an attempt to process unauthorized mailboxes.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
} else {
  console.warn('⚠️ WARNING: No expected_domains configured - processing ALL mailboxes (not recommended for production)');
}
// ============================================================

if (filteredMailboxes.length === 0) {
  return [{ json: { error: 'No mailboxes found to process after domain filtering', config, source, rejected_count: rejectedMailboxes.length } }];
}

// Merge with Phase 1 results for displayName if available
const phase1Results = executionData.phase1_results || [];

return filteredMailboxes.map(mailbox => {
  // Find matching Phase 1 result by email
  const phase1Match = phase1Results.find(p => 
    p.email && mailbox.emailAddress && p.email.toLowerCase() === mailbox.emailAddress.toLowerCase()
  );
  
  return {
    json: {
      ...mailbox,
      // Use Phase 1 displayName if available, otherwise use senderName from API
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
