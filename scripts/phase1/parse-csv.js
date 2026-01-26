// Extract configuration from workflow execution data
const executionData = $input.first().json;

// Check if data was passed via workflow fields
const config = executionData.inputData ? JSON.parse(executionData.inputData) : executionData;

const workspaceId = config.reply_workspace_id || 'default-workspace';
// Check both mailbox_csv_content AND data fields
const mailboxCsv = config.mailbox_csv_content || config.data || '';
const sendingLimits = config.sending_limits || { daily: 50, hourly: 10 };
const forceOverwrite = config.force_overwrite || false;
const companyName = config.company_name || 'Test Company';

console.log('Parse CSV - mailboxCsv length:', mailboxCsv.length);
console.log('Parse CSV - first 100 chars:', mailboxCsv.substring(0, 100));

// If no CSV content, return mock data for testing
if (!mailboxCsv || mailboxCsv.trim() === '') {
  return [{ json: {
    email: 'test@example.com',
    senderName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    domain: 'example.com',
    displayName: 'Test',
    dailyLimit: 50,
    smtp: { host: 'smtp.example.com', port: 587, password: 'test' },
    imap: { host: 'imap.example.com', port: 993, password: 'test' },
    warmup: { dailyGoal: 20, dailyIncrement: 2 },
    workspaceId,
    forceOverwrite,
    companyName,
    rowNumber: 2,
    _isMockData: true
  }}];
}

// Parse CSV manually (csv-parse not available in n8n)
const lines = mailboxCsv.trim().split('\n');
const headers = lines[0].split(',').map(h => h.trim());
const records = [];

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',').map(v => v.trim());
  const record = {};
  headers.forEach((header, idx) => {
    record[header] = values[idx] || '';
  });
  records.push(record);
}

// Transform records
const mailboxes = records.map((record, index) => {
  // Parse name
  const nameParts = (record['Sender Name'] || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  // Extract domain
  const domain = record.Email.match(/@(.+)$/)?.[1] || '';
  
  return {
    email: record.Email.trim().toLowerCase(),
    senderName: record['Sender Name'],
    firstName,
    lastName,
    domain,
    displayName: firstName, // Use first name only
    dailyLimit: parseInt(record['Daily Limit']) || 50,
    smtp: {
      host: record['SMTP Host'] || '',
      port: parseInt(record['SMTP Port']) || 587,
      password: record['SMTP Password'] || ''
    },
    imap: {
      host: record['IMAP Host'] || '',
      port: parseInt(record['IMAP Port']) || 993,
      password: record['IMAP Password'] || ''
    },
    warmup: {
      dailyGoal: parseInt(record['Warmup Daily Goal']) || 20,
      dailyIncrement: parseInt(record['Warmup Daily Increment']) || 2
    },
    workspaceId,
    forceOverwrite,
    companyName,
    rowNumber: index + 2
  };
});

return mailboxes.map(m => ({ json: m }));
