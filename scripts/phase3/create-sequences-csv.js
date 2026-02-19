const data = $input.first().json;
const csvData = data.csv_data || [];

const headers = ['Email', 'Cloned Name', 'Sequence ID', 'URL', 'Status', 'Steps', 'Error'];
const rows = csvData.map(row => {
  const seqId = row.cloned_id || '';
  const url = seqId ? `https://app.reply.io/sequences/${seqId}` : '';
  return [
    row.mailbox_email || '',
    row.cloned_name || '',
    seqId,
    url,
    row.status || '',
    row.steps || '',
    row.error || ''
  ];
});

const csv = [
  headers.join(','),
  ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
].join('\n');

return [{
  json: {
    task_id: data.task_id,
    phase: data.phase,
    csv: csv,
    summary: data.summary
  }
}];
