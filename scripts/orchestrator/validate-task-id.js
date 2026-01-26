// FAIL-SAFE: Validate task_id before proceeding
// Never use hardcoded fallbacks that could fetch wrong client data!
const input = $input.first().json;

// Try to extract task_id from multiple possible sources
let taskId = input.task_id || input.body?.task_id;

// Log what we received for debugging
console.log('Input received:', JSON.stringify(input, null, 2));
console.log('Extracted task_id:', taskId);

// CRITICAL: Do NOT use fallback IDs from webhook payloads that might be stale/wrong
// The previous bug used: $json.body?.payload?.id || $json.webhook_event?.task_id || $json.history_items?.[0]?.id
// These could pick up IDs from completely different tasks!

if (!taskId) {
  const errorMsg = `🚨 FAIL-SAFE: No task_id provided to orchestrator. Input keys: [${Object.keys(input).join(', ')}]. ` +
    `This workflow requires an explicit task_id to prevent cross-client data contamination. ` +
    `Check that the Status Change Router is passing task_id correctly.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

// Validate task_id format (ClickUp IDs are alphanumeric, 9 chars)
if (typeof taskId !== 'string' || !/^[a-z0-9]+$/i.test(taskId)) {
  const errorMsg = `🚨 FAIL-SAFE: Invalid task_id format: "${taskId}". Expected alphanumeric ClickUp task ID.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

console.log(`✅ Validated task_id: ${taskId}`);
return [{ json: { ...input, task_id: taskId, _validated: true } }];
