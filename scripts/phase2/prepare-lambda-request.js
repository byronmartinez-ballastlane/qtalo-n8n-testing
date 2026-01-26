// Prepare Lambda request with async webhook pattern
// Collect all items that need signature updates (not skipped)
// INCLUDES: expected_domains for Lambda-level domain validation (defense in depth)
// INCLUDES: reply_workspace_id for workspace switching
const items = $input.all();

// Wait node webhook URL format: /webhook-waiting/{executionId}
// Use n8n Cloud URL for production
const executionId = $execution.id;
const webhookUrl = `https://qtalospace.app.n8n.cloud/webhook-waiting/${executionId}`;

console.log(`🔗 Webhook URL: ${webhookUrl}`);
console.log(`📤 Lambda should GET this URL to resume workflow`);

// Get client_id, expected_domains and reply_workspace_id from config
// Pass to Lambda for defense-in-depth validation and workspace switching
const firstItem = items[0]?.json || {};
const config = firstItem.config || {};
const clientId = config.client_id || firstItem.client_id;
const expectedDomains = config.expected_domains || [];
const replyWorkspaceId = config.reply_workspace_id || null;

if (!clientId) {
  throw new Error('client_id is required but not found in config or input data');
}

console.log(`🎯 Client ID: ${clientId}`);
console.log(`🔒 Passing expected_domains to Lambda: ${expectedDomains.join(', ') || 'NONE (WARNING!)'}`);
console.log(`🏢 Passing reply_workspace_id to Lambda: ${replyWorkspaceId || 'DEFAULT (not set)'}`);

// Convert plain text signatures to HTML
function textToHtml(text) {
  if (!text) return '';
  const lines = text.split('\n').filter(line => line.trim());
  const htmlLines = lines.map(line => {
    // Bold lines that look like names (capitalized words)
    if (line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)) {
      return `<p><strong>${line}</strong></p>`;
    }
    return `<p>${line}</p>`;
  });
  return htmlLines.join('');
}

// Prepare accounts array for Lambda
const accounts = items.map(item => ({
  email: item.json.email,
  accountId: String(item.json.mailbox_id),
  signature: textToHtml(item.json.signature)
}));

// Store original items for later matching
const originalItems = items.map(item => item.json);

// Lambda will fetch Reply.io UI credentials from AWS Secrets Manager using client_id
// SECURITY: Also pass expected_domains for Lambda-level validation
// WORKSPACE: Pass reply_workspace_id for workspace switching
return [{
  json: {
    client_id: clientId,
    async: true,
    webhookUrl: webhookUrl,
    // CRITICAL: Pass expected_domains for defense-in-depth domain validation
    expected_domains: expectedDomains,
    // WORKSPACE SWITCHING: Pass workspace name for Lambda to switch to
    reply_workspace_id: replyWorkspaceId,
    // Optional: Enable dry_run mode for testing (set to true to validate without changes)
    dry_run: false,
    accounts,
    _originalItems: originalItems,
    _domainValidation: firstItem._domainValidation || {}
  }
}];
