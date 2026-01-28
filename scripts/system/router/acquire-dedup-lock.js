// ATOMIC DEDUPLICATION using staticData
// This runs IMMEDIATELY to prevent race conditions
const webhookData = $input.first().json;
const body = webhookData.body || webhookData;

// Extract task ID and status for dedup key
const taskId = body.task_id || body.history_items?.[0]?.task?.id || body.payload?.id;
const historyItems = body.history_items || [];
const statusChange = historyItems.find(h => h.field === 'status');
const newStatus = statusChange?.after?.status?.toLowerCase() || '';

if (!taskId || !newStatus) {
  return [{ json: { ...webhookData, _dedupe_skip: false } }];
}

const dedupKey = `${taskId}_${newStatus}`;
const staticData = $getWorkflowStaticData('global');
const locks = staticData.statusLocks || {};
const now = Date.now();

const LOCK_TTL_MS = 2 * 60 * 1000;
for (const [key, timestamp] of Object.entries(locks)) {
  if (now - timestamp > LOCK_TTL_MS) {
    delete locks[key];
  }
}

if (locks[dedupKey]) {
  const secondsAgo = ((now - locks[dedupKey]) / 1000).toFixed(1);
  console.log(`🔒 DUPLICATE BLOCKED: ${dedupKey} is already being processed (locked ${secondsAgo}s ago)`);
  return [{ json: { ...webhookData, _dedupe_skip: true, _dedupe_reason: `Locked ${secondsAgo}s ago` } }];
}

locks[dedupKey] = now;
staticData.statusLocks = locks;

console.log(`🔓 LOCK ACQUIRED: ${dedupKey}`);
return [{ json: { ...webhookData, _dedupe_skip: false, _dedupe_key: dedupKey } }];