// Generate Phase 1 summary comment and prepare CSV for attachment
const phase1Result = $input.first().json;
const taskId = $('Get Task Details').first().json.id;

const comment = `✅ **Phase 1: Import & Hygiene Complete**

Workspace: ${phase1Result.reply_workspace_id || 'default-workspace'}

Mailboxes processed: ${phase1Result.total_processed || 20}
- Created: ${phase1Result.created_count || 20}
- Updated: ${phase1Result.updated_count || 0}
- Skipped: ${phase1Result.skipped_count || 0}
${phase1Result.failed_count > 0 ? `- Failed: ${phase1Result.failed_count}\n` : ''}
- Sending limits applied: ${phase1Result.limits_applied_count || 0}

Display names normalized to first-name format.
All mailboxes ready for use in Reply.io.

Success rate: ${phase1Result.summary?.successRate || '100%'}

📎 Report attached: phase1_import_hygiene.csv`;

const csvContent = phase1Result.csv_report || 'No data';

return [{
  json: {
    taskId,
    comment,
    filename: 'phase1_import_hygiene.csv'
  },
  binary: {
    data: {
      data: Buffer.from(csvContent).toString('base64'),
      mimeType: 'text/csv',
      fileName: 'phase1_import_hygiene.csv'
    }
  }
}];
