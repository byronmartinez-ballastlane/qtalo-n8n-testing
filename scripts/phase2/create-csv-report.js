// Generate CSV report
const items = $input.all();

// Manual CSV generation (no external dependencies)
const headers = ['Email', 'Status', 'Generated Signature', 'Opt-Out Line', 'Message', 'Timestamp'];
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const rows = items.map(item => [
  escapeCSV(item.json.email || ''),
  escapeCSV(item.json.status || ''),
  escapeCSV(item.json.generatedSignature || ''),
  escapeCSV(item.json.optOutLine || ''),
  escapeCSV(item.json.message || ''),
  escapeCSV(item.json.timestamp || '')
]);

const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

// Generate summary
const total = items.length;
const successful = items.filter(i => i.json.status === 'success').length;
const failed = items.filter(i => i.json.status === 'error').length;
const skipped = items.filter(i => i.json.status === 'skipped').length;

// Get task_id from Start node
const taskId = $('Start').first().json.task_id;

return [{
  json: {
    task_id: taskId,
    phase: 'Phase 2: Signatures & Opt-Outs',
    csv: csv,
    summary: {
      total,
      successful,
      failed,
      skipped,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%'
    }
  }
}];
