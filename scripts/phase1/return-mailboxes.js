// Return mailboxes data to orchestrator for Phase 3 sequence assignment
const allResults = $('Combine All Results').all();

// Extract successfully created/existing mailboxes with id and email
const mailboxes = allResults
  .map(item => item.json)
  .filter(m => m.id && m.email && !m.error)
  .map(m => ({
    id: m.id,
    email: m.email,
    senderName: m.senderName || m.displayName
  }));

console.log(`Returning ${mailboxes.length} mailboxes to orchestrator`);

return [{
  json: {
    mailboxes,
    mailbox_count: mailboxes.length
  }
}];
