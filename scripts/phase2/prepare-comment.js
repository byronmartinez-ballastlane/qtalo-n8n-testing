const data = $('Prepare CSV Binary').first().json;
const config = $('Start').first().json;
const summary = data.summary;

const comment = `✅ **Phase 2: Signatures & Opt-Outs Complete**

Mailboxes processed: ${summary.total}
- Successful: ${summary.successful}
- Failed: ${summary.failed}
- Skipped: ${summary.skipped}
- Success rate: ${summary.successRate}

📎 Report attached above: phase2_signatures.csv`;

return [{ json: { task_id: data.task_id, comment } }];
