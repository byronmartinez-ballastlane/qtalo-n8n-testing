const data = $input.first().json;
const exists = data.exists === true;

return [{
  json: {
    ...data,
    isNew: !exists
  }
}];