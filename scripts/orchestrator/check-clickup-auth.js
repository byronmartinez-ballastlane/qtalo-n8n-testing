const response = $input.first().json;

const validatedData = $("Validate Task ID").first().json;
const taskId = validatedData.task_id;

if (!taskId || taskId === 'unknown') {
  throw new Error(`🚨 FAIL-SAFE: task_id is missing or invalid. Cannot proceed without explicit task_id.`);
}

if (response.err || response.error || response.statusCode === 401 || response.statusCode === 403) {
  const errorMsg = response.err || response.error || response.message || 'Authentication failed';
  const statusCode = response.statusCode || 'unknown';
  
  console.error(`❌ ClickUp Auth Error (${statusCode}): ${errorMsg}`);
  throw new Error(`ClickUp API authentication failed (${statusCode}): ${errorMsg}. Please update credentials.`);
}

if (response.id && response.id !== taskId) {
  console.warn(`⚠️ Task ID mismatch: requested ${taskId}, got ${response.id}. Using requested ID.`);
}

console.log(`✅ ClickUp auth OK, task: ${taskId} (${response.name || 'no name'})`);
return [{ json: { ...response, task_id: taskId, _task_validated: true } }];
