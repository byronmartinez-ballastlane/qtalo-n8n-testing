// Prepare CSV as binary data for upload
const data = $input.first().json;
const csvContent = data.csv_report || 'No data';
const taskId = $('Start').first().json.task_id;

// Convert CSV to base64 for binary transfer
const base64Content = Buffer.from(csvContent, 'utf8').toString('base64');

return [{
  json: {
    task_id: taskId,
    summary: data.summary,
    csv: data.csv_report,
    phase: data.phase
  },
  binary: {
    data: {
      data: base64Content,
      mimeType: 'text/csv',
      fileName: 'phase1_import_hygiene.csv'
    }
  }
}];
