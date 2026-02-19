const data = $('Prepare CSV Binary').first().json;
const summary = data.summary;

let scheduleInfo = '';
try {
  const scheduleData = $('Schedule Complete').first().json;
  if (scheduleData.schedule_id) {
    scheduleInfo = `\n**Sending Schedule:**\n- Name: ${scheduleData.schedule_config?.name || 'N/A'}\n- ID: ${scheduleData.schedule_id}\n- Is Default: ${scheduleData.schedule_is_default ? 'Yes' : 'No'}\n- Status: ${scheduleData.schedule_message || 'Created'}\n`;
  } else if (scheduleData.schedule_skipped) {
    scheduleInfo = '\n**Sending Schedule:** Not configured\n';
  }
} catch (e) {
  scheduleInfo = '';
}

const comment = `✅ **Phase 1: Import & Hygiene Complete**\n${scheduleInfo}\nMailboxes processed: ${summary.total}\n- Created: ${summary.created}\n- Updated: ${summary.updated}\n- Skipped: ${summary.skipped}\n- Failed: ${summary.failed}\n- Limits Applied: ${summary.limitsApplied}\n- Success rate: ${summary.successRate}\n\n${summary.failed > 0 ? '⚠️ Some mailboxes failed to process. See attached CSV for details.\n\n' : ''}📎 Report attached: phase1_import_hygiene.csv`;

return [{ json: { task_id: data.task_id, comment } }];
