const processData = $('Process Fields Spec').first().json;
const createResults = $input.all();
const splitResults = $('Split Fields to Create').all();

const fieldsToSkip = createResults.length > 0 ? (createResults[0].json.fields_to_skip || []) : (processData.fields_to_skip || []);

const created = [];
const alreadyExisted = [];
const failed = [];

const mapFieldTypeBack = (type) => {
  return type === 1 ? 'number' : 'text';
};

createResults.forEach((item, index) => {
  const originalData = splitResults[index]?.json || {};
  const fieldTitle = item.json.title || item.json.field_title || originalData.field_title || 'unknown';
  const fieldType = item.json.fieldType !== undefined ? item.json.fieldType : (item.json.field_type !== undefined ? item.json.field_type : originalData.field_type);
  
  if (item.json.error) {
    const errorMsg = item.json.error.message || item.json.error.toString();
    
    if (errorMsg.includes('ALREADY_EXISTS_ERROR') || errorMsg.includes('already exists')) {
      alreadyExisted.push({
        title: fieldTitle,
        type: mapFieldTypeBack(fieldType),
        reason: 'already exists'
      });
    } else {
      failed.push({
        title: fieldTitle,
        error: errorMsg
      });
    }
  } else {
    created.push({
      title: fieldTitle,
      id: item.json.id,
      type: mapFieldTypeBack(fieldType)
    });
  }
});

const summary = {
  total: (processData.fields_to_create?.length || 0) + fieldsToSkip.length,
  created: created.length,
  alreadyExisted: alreadyExisted.length,
  skipped: fieldsToSkip.length,
  failed: failed.length,
  successRate: `${Math.round(((created.length + alreadyExisted.length) / Math.max(1, created.length + alreadyExisted.length + failed.length)) * 100)}%`
};

return [{
  json: {
    task_id: processData.task_id,
    phase: 'Phase 3: Custom Fields',
    summary,
    created,
    alreadyExisted,
    failed,
    skipped: fieldsToSkip,
    csv_data: [
      ...created.map(f => ({ title: f.title, type: f.type, status: 'created', id: f.id, error: '' })),
      ...alreadyExisted.map(f => ({ title: f.title, type: f.type, status: 'already existed', id: '', error: '' })),
      ...fieldsToSkip.map(f => ({ title: f.title, type: mapFieldTypeBack(f.type), status: 'skipped', id: f.id || '', error: f.reason })),
      ...failed.map(f => ({ title: f.title, type: '', status: 'failed', id: '', error: f.error }))
    ]
  }
}];
