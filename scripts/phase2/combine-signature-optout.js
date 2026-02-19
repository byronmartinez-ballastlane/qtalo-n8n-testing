const items = $input.all();

return items.map(item => {
  return {
    json: {
      ...item.json
    }
  };
});
