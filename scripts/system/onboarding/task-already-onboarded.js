// Check if task exists and set routing flag
const data = $input.first().json;
const exists = data.exists === true;

// Return item with explicit isNew flag
return [{
  json: {
    ...data,
    isNew: !exists
  }
}];