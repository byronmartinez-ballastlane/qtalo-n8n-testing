const item = $input.first();
const taskId = item.json.taskId;
const fileName = item.json.filename || 'phase1_import_hygiene.csv';

if (!item.binary || !item.binary.data) {
  return { json: { success: false, error: 'No binary data found' } };
}

const binaryInfo = item.binary.data;
const fileBuffer = Buffer.from(binaryInfo.data, 'base64');

try {
  const response = await this.helpers.request({
    method: 'POST',
    uri: `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
    headers: {
      'Authorization': 'HARDCODED_CLICKUP_API_KEY'
    },
    formData: {
      attachment: {
        value: fileBuffer,
        options: {
          filename: fileName,
          contentType: binaryInfo.mimeType || 'text/csv'
        }
      }
    },
    json: true
  });
  
  return { json: { success: true, status: 200, attachment: response } };
} catch (error) {
  return { json: { success: false, error: error.message, details: error.toString() } };
}
