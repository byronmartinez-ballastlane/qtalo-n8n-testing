const items = $input.all();

return items.map(item => ({
  json: {
    ...item.json,
    limits_applied: false,
    limits_skipped_reason: 'Limits API disabled'
  }
}));
