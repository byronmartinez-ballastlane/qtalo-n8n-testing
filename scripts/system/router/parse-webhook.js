// Parse ClickUp webhook and extract task info
const webhookData = $input.first().json;
const body = webhookData.body || webhookData;

console.log('📥 Received status change webhook');

const taskId = body.task_id || body.history_items?.[0]?.task?.id || body.payload?.id;

if (!taskId) {
  console.log('⚠️ No task ID found');
  return [{ json: { skip: true, reason: 'No task ID' } }];
}

const historyItems = body.history_items || [];
const statusChange = historyItems.find(h => h.field === 'status');

if (!statusChange) {
  console.log('⚠️ Not a status change event');
  return [{ json: { skip: true, reason: 'Not a status change' } }];
}

const newStatus = (statusChange.after?.status || '').toLowerCase();
const oldStatus = (statusChange.before?.status || '').toLowerCase();

const shouldTrigger = newStatus.includes('reply');

if (!shouldTrigger) {
  console.log(`⚠️ Status '${newStatus}' is not a trigger status (only 'reply' triggers)`);
  return [{ json: { skip: true, reason: `Status '${newStatus}' not in trigger list` } }];
}

console.log(`✅ Status changed: ${oldStatus} → ${newStatus}`);

return [{
  json: {
    skip: false,
    task_id: taskId,
    old_status: oldStatus,
    new_status: newStatus
  }
}];