const data = $input.first().json;
const csvContent = data.csv || 'No data';
const taskId = data.task_id || $('Start').first().json.task_id;

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
      fileName: 'phase2_signatures.csv'
    }
  }
}];
