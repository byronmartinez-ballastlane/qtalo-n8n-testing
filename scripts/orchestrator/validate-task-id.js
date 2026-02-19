const input = $input.first().json;

let taskId = input.task_id || input.body?.task_id;

console.log('Input received:', JSON.stringify(input, null, 2));
console.log('Extracted task_id:', taskId);


if (!taskId) {
  const errorMsg = `🚨 FAIL-SAFE: No task_id provided to orchestrator. Input keys: [${Object.keys(input).join(', ')}]. ` +
    `This workflow requires an explicit task_id to prevent cross-client data contamination. ` +
    `Check that the Status Change Router is passing task_id correctly.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

if (typeof taskId !== 'string' || !/^[a-z0-9]+$/i.test(taskId)) {
  const errorMsg = `🚨 FAIL-SAFE: Invalid task_id format: "${taskId}". Expected alphanumeric ClickUp task ID.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}

console.log(`✅ Validated task_id: ${taskId}`);
return [{ json: { ...input, task_id: taskId, _validated: true } }];
