const items = $input.all();

const executionId = $execution.id;
const webhookUrl = `https://qtalospace.app.n8n.cloud/webhook-waiting/${executionId}`;

console.log(`🔗 Webhook URL: ${webhookUrl}`);
console.log(`📤 Lambda should GET this URL to resume workflow`);

const firstItem = items[0]?.json || {};
const config = firstItem.config || {};
const clientId = config.client_id || firstItem.client_id;
const expectedDomains = config.expected_domains || [];
const replyWorkspaceId = config.reply_workspace_id || null;

if (!clientId) {
  throw new Error('client_id is required but not found in config or input data');
}

console.log(`🎯 Client ID: ${clientId}`);
console.log(`🔒 Passing ${expectedDomains.length} expected_domains to Lambda: ${expectedDomains.join(', ') || 'NONE (domain filter disabled)'}`);
console.log(`🏢 Passing reply_workspace_id to Lambda: ${replyWorkspaceId || 'DEFAULT (not set)'}`);

function textToHtml(text) {
  if (!text) return '';
  const lines = text.split('\n').filter(line => line.trim());
  const htmlLines = lines.map(line => {
    if (line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)) {
      return `<p><strong>${line}</strong></p>`;
    }
    return `<p>${line}</p>`;
  });
  return htmlLines.join('');
}

const accounts = items.map(item => ({
  email: item.json.email,
  accountId: String(item.json.mailbox_id),
  signature: textToHtml(item.json.signature)
}));

const originalItems = items.map(item => item.json);

return [{
  json: {
    client_id: clientId,
    async: true,
    webhookUrl: webhookUrl,
    expected_domains: expectedDomains,
    reply_workspace_id: replyWorkspaceId,
    dry_run: false,
    accounts,
    _originalItems: originalItems,
    _domainValidation: firstItem._domainValidation || {}
  }
}];
