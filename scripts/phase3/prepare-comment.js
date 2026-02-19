const data = $('Prepare CSV Binary').first().json;
const summary = data.summary;

const comment = `✅ **Phase 3: Custom Fields Complete**

Custom fields processed: ${summary.total}
- Created: ${summary.created}
- Already existed: ${summary.alreadyExisted}
- Skipped: ${summary.skipped}
- Failed: ${summary.failed}
- Success rate: ${summary.successRate}

${summary.failed > 0 ? '⚠️ Some fields failed to create. See attached CSV for details.\n\n' : ''}📎 Report attached: phase3_custom_fields.csv`;

return [{ json: { task_id: data.task_id, comment } }];
