// Mark truly skipped mailboxes (no update needed)
const items = $input.all();

const results = items.map(item => {
  return {
    json: {
      ...item.json,
      action: 'skipped',
      skipped: true
    }
  };
});

return results;
