// Check if CSV URL exists before trying to download
const config = $input.first().json;

if (!config.csv_attachment_url || config.csv_attachment_url === '') {
  console.log('⚠️ No CSV attachment found in ClickUp task');
  
  // Post warning comment to ClickUp
  try {
    await this.helpers.request({
      method: 'POST',
      uri: `https://api.clickup.com/api/v2/task/${config.task_id}/comment`,
      headers: {
        'Authorization': 'HARDCODED_CLICKUP_API_KEY',
        'Content-Type': 'application/json'
      },
      body: {
        comment_text: '⚠️ **No Mailbox CSV Found**\n\nNo CSV attachment was found in this task. The workflow will proceed using existing mailboxes from Reply.io.\n\n**To add a CSV:**\n1. Attach a file named `sample-mailboxes.csv` to this task\n2. Re-run the workflow'
      },
      json: true
    });
    console.log('✅ Posted warning comment to ClickUp');
  } catch (error) {
    console.error('❌ Failed to post warning comment:', error.message);
  }
  
  return [{
    json: {
      ...config,
      skip_csv_download: true,
      csv_download_skipped_reason: 'No CSV attachment URL found'
    }
  }];
}

console.log('✅ CSV attachment URL found:', config.csv_attachment_url);
return [{ json: config }];
