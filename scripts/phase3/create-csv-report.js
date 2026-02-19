const data = $input.first().json;
const csvData = data.csv_data || [];

const headers = ['Title', 'Type', 'Status', 'Field ID', 'Error'];
const rows = csvData.map(row => [
  row.title || '',
  row.type || '',
  row.status || '',
  row.id || '',
  row.error || ''
]);

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
