// Combine CSV content with config
const maybeDownloaded = $input.first().json;
const config = $('Check CSV Exists').first().json;

let csvContent = '';

if (config.skip_csv_download) {
  csvContent = '';
} else if (typeof maybeDownloaded === 'string' && maybeDownloaded.length > 0) {
  csvContent = maybeDownloaded;
}

const output = {
  ...config,
  mailbox_csv_content: csvContent,
  data: csvContent
};

if (!output.opt_out_variants || output.opt_out_variants.length === 0) {
  output.opt_out_variants = [
    "If you're ready to move on from my emails, just reply.",
    "Not interested? Let me know.",
    "Reply to unsubscribe."
  ];
}

return [{ json: output }];
