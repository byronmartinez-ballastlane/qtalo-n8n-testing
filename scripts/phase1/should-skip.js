// Check if mailbox already exists and should skip or update
// Also detect 401/403 auth errors from Reply.io API
const parseItems = $('Parse CSV').all();
const checkMailboxItems = $('Check Mailbox Exists').all();
const startData = $('Start').first().json;
const config = startData.inputData ? JSON.parse(startData.inputData) : startData;
const taskId = config.task_id;

// Get existing accounts - n8n splits array responses into individual items
const existingAccounts = checkMailboxItems.map(item => item.json);

// ============================================================
// CHECK FOR REPLY.IO AUTH ERRORS (401/403)
// ============================================================
const firstResponse = existingAccounts[0] || {};
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
          comment_text: `🚨 **Authentication Error - Reply.io API**\n\n**Error Code:** ${statusCode}\n**Message:** ${errorMsg}\n\n**Action Required:**\n1. Verify the Reply.io API key is valid\n2. Check if the API key has the correct permissions\n3. Update the API key in the n8n workflow\n\n**API Endpoint:** GET /v1/EmailAccounts\n**Current API Key (last 8 chars):** ...${HARDCODED_REPLY_API_KEY.slice(-8)}`
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

console.log(`Found ${existingAccounts.length} existing email accounts in Reply.io`);

// Process each mailbox from Parse CSV
const results = parseItems.map((item, index) => {
  const currentEmail = item.json.email;
  const desiredDisplayName = item.json.displayName;
  const forceOverwrite = item.json.forceOverwrite;
  
  // Find existing mailbox data
  const existingMailbox = existingAccounts.find(acc => 
    acc.emailAddress && acc.emailAddress.toLowerCase() === currentEmail.toLowerCase()
  );
  
  const emailExists = !!existingMailbox;
  const currentSenderName = existingMailbox ? existingMailbox.senderName : '';
  const senderNameDiffers = currentSenderName !== desiredDisplayName;
  
  // Should update if: exists AND (forceOverwrite OR senderName differs)
  const shouldUpdate = emailExists && (forceOverwrite || senderNameDiffers);
  
  // Should skip if: exists AND NOT updating
  const shouldSkip = emailExists && !shouldUpdate;
  
  console.log(`Email ${currentEmail}: exists=${emailExists}, current="${currentSenderName}", desired="${desiredDisplayName}", differs=${senderNameDiffers}, forceOverwrite=${forceOverwrite}, shouldUpdate=${shouldUpdate}, shouldSkip=${shouldSkip}`);
  
  return {
    json: {
      ...item.json,
      emailExists,
      currentSenderName,
      senderNameDiffers,
      shouldUpdate,
      shouldSkip,
      existingAccountsCount: existingAccounts.length,
      existingMailboxId: existingMailbox ? existingMailbox.id : null,
      task_id: taskId
    }
  };
});

return results;
