const data = $('Prepare Sequences CSV Binary').first().json;
const summary = data.summary;

const comment = `✅ **Phase 3: Sequences Cloned**

Sequences processed: ${summary.total}
- Created: ${summary.created}
- Skipped: ${summary.skipped}
- Failed: ${summary.failed}
- Success rate: ${summary.successRate}

${summary.failed > 0 ? '⚠️ Some sequences failed to clone. See attached CSV for details.\n\n' : ''}📎 Report attached: phase3_sequences.csv`;

return [{ json: { task_id: data.task_id, comment } }];
