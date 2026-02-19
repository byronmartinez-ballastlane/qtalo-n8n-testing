const items = $input.all();

const records = items.map(item => ({
  Email: item.json.email,
  Status: item.json.status,
  Action: item.json.action,
  DisplayName: item.json.displayName,
  LimitsApplied: item.json.limits_applied ? 'Yes' : 'No',
  LimitsError: item.json.limits_error || '',
  Error: item.json.error || '',
  Timestamp: item.json.timestamp
}));

const headers = ['Email', 'Status', 'Action', 'Display Name', 'Limits Applied', 'Limits Error', 'Error', 'Timestamp'];
const csvLines = [headers.join(',')];
records.forEach(r => {
  const errorText = String(r.Error || '').replace(/,/g, ';');
  const limitsError = String(r.LimitsError || '').replace(/,/g, ';');
  csvLines.push([
    r.Email,
    r.Status,
    r.Action,
    r.DisplayName,
    r.LimitsApplied,
    limitsError,
    errorText,
    r.Timestamp
  ].join(','));
});
const csv = csvLines.join('\n');

const total = items.length;
const created = items.filter(i => i.json.action === 'created').length;
const updated = items.filter(i => i.json.action === 'updated').length;
const skipped = items.filter(i => i.json.status === 'skipped').length;
const failed = items.filter(i => i.json.status === 'error').length;
const limitsApplied = items.filter(i => i.json.limits_applied === true).length;

return [{
  json: {
    phase: 'Phase 1: Import & Hygiene',
    total_processed: total,
    created_count: created,
    updated_count: updated,
    skipped_count: skipped,
    failed_count: failed,
    limits_applied_count: limitsApplied,
    reply_workspace_id: items[0]?.json.workspaceId || 'default-workspace',
    csv_report: csv,
    summary: {
      total,
      created,
      updated,
      skipped,
      failed,
      limitsApplied,
      successRate: total > 0 ? ((created + updated) / total * 100).toFixed(2) + '%' : '0%'
    },
    results: items.map(i => i.json)
  }
}];
