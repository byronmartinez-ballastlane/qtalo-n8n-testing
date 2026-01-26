// Filter out failed items that now exist
const failedItems = $('Detect Failed Creations', 1).all();
const existingMailboxes = $input.all(); // Each item is one mailbox

// Extract existing email addresses
const existingEmails = existingMailboxes
  .map(item => item.json.emailAddress?.toLowerCase())
  .filter(Boolean);

console.log(`Re-check: Found ${existingEmails.length} existing mailboxes`);
console.log(`Existing emails: ${existingEmails.slice(0, 5).join(', ')}...`);

// Filter out items that now exist
const itemsToRetry = failedItems.filter(item => {
  const email = item.json.email?.toLowerCase();
  const alreadyExists = existingEmails.includes(email);
  if (alreadyExists) {
    console.log(`✓ Skipping retry for ${item.json.email} - already created`);
  }
  return !alreadyExists;
});

console.log(`→ Retrying ${itemsToRetry.length} out of ${failedItems.length} failed mailboxes`);

if (itemsToRetry.length === 0) {
  console.log('All failed mailboxes now exist - no retries needed!');
  return [];
}

return itemsToRetry;
