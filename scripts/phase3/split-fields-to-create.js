// Split fields to create into individual items
const data = $input.first().json;
const fieldsToCreate = data.fields_to_create || [];

if (fieldsToCreate.length === 0) {
  return [];
}

return fieldsToCreate.map(field => ({
  json: {
    task_id: data.task_id,
    fields_to_skip: data.fields_to_skip || [],
    field_title: field.title,
    field_type: field.type
  }
}));
