// Collect sequence cloning results
const processData = $('Process Sequences Spec').first().json;
const cloneResults = $input.all();
const sequencesToSkip = processData.sequences_to_skip || [];

const created = [];
const skipped = [];
const failed = [];

cloneResults.forEach(item => {
  const status = item.json.status;
  
  if (status === 'created') {
    created.push(item.json);
  } else if (status === 'skipped') {
    skipped.push(item.json);
  } else {
    failed.push(item.json);
  }
});

const summary = {
  total: processData.sequences_to_clone?.length || 0,
  created: created.length,
  skipped: skipped.length + sequencesToSkip.length,
  failed: failed.length,
  successRate: `${Math.round((created.length / Math.max(1, created.length + failed.length)) * 100)}%`
};

return [{
  json: {
    task_id: processData.task_id,
    phase: 'Phase 3: Sequences',
    summary,
    created,
    skipped: [...skipped, ...sequencesToSkip],
    failed,
    csv_data: [
      ...created.map(s => ({ source_id: s.source_sequence_id, mailbox_email: s.mailbox_email, name: s.sequence_name, cloned_name: s.cloned_name, cloned_id: s.cloned_id, status: 'created', steps: s.steps_cloned, error: '' })),
      ...skipped.map(s => ({ source_id: s.source_sequence_id, mailbox_email: s.mailbox_email, name: s.sequence_name, cloned_name: '', cloned_id: '', status: 'skipped', steps: 0, error: s.error })),
      ...sequencesToSkip.map(s => ({ source_id: s.source_id, mailbox_email: '', name: s.name || 'unknown', cloned_name: '', cloned_id: '', status: 'skipped', steps: 0, error: s.reason })),
      ...failed.map(s => ({ source_id: s.source_sequence_id, mailbox_email: s.mailbox_email, name: s.sequence_name, cloned_name: '', cloned_id: '', status: 'failed', steps: 0, error: s.error }))
    ]
  }
}];
