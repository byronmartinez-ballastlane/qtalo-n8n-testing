// Prepare CSV as binary data for upload
const data = $input.first().json;
const csvContent = data.csv || 'No data';
const taskId = data.task_id;

// Convert CSV to base64 for binary transfer
const base64Content = Buffer.from(csvContent, 'utf8').toString('base64');

return [{
  json: {
    task_id: taskId,
    summary: data.summary,
    csv: data.csv,
    phase: data.phase
  },
  binary: {
    data: {
      data: base64Content,
      mimeType: 'text/csv',
      fileName: 'phase3_custom_fields.csv'
    }
  }
}];
