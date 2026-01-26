// Generate Phase 2 completion comment
// Get data from Prepare CSV Binary node (before HTTP upload overwrites it)
const data = $('Prepare CSV Binary').first().json;
const config = $('Start').first().json;
const summary = data.summary;

const comment = `✅ **Phase 2: Signatures & Opt-Outs Complete**

Mailboxes processed: ${summary.total}
- Successful: ${summary.successful}
- Failed: ${summary.failed}
- Skipped: ${summary.skipped}
- Success rate: ${summary.successRate}

⚠️ **Important API Limitation:**
Reply.io API does not support programmatic signature or opt-out updates.
These must be applied manually in Reply.io UI.

**Signature Template (to apply manually):**
${'```'}
Regards,
${'{{first_name}}'} @ ${config.company_name || 'Your Company'}
Business Development Manager
${config.company_url || 'www.yourcompany.com'}
${'{{domain}}'}
${'```'}

**Instructions:**
1. Go to Reply.io → Settings → Email Accounts
2. For each mailbox, apply the signature template above
3. Replace ${'{{first_name}}'} with actual first name
4. Replace ${'{{domain}}'} with email domain
5. Add one opt-out variant at the bottom

📎 Report attached above: phase2_signatures.csv`;

return [{ json: { task_id: data.task_id, comment } }];
