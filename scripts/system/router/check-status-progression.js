const client = $input.first().json;
const webhookData = $('Parse Webhook').first().json;
const newStatus = webhookData.new_status;
const oldStatus = webhookData.old_status;
const lastProcessedStatus = client.last_processed_status;
const lastExecutionTimestamp = client.last_execution_timestamp;

console.log(`📊 Status Change: ${oldStatus} → ${newStatus}`);
console.log(`📌 Last Processed: ${lastProcessedStatus || 'none'}`);
console.log(`⏰ Last Execution: ${lastExecutionTimestamp || 'none'}`);

if (lastProcessedStatus === newStatus && lastExecutionTimestamp) {
  const lastExecTime = new Date(lastExecutionTimestamp).getTime();
  const now = Date.now();
  const secondsSinceLastExec = (now - lastExecTime) / 1000;
  
  if (secondsSinceLastExec < 60) {
    console.log(`⏭️ Status '${newStatus}' was processed ${secondsSinceLastExec.toFixed(1)}s ago - skipping duplicate`);
    return [{ json: { ...client, skip: true, reason: `Duplicate: processed ${secondsSinceLastExec.toFixed(1)}s ago` } }];
  }
}

const STATUS_ORDER = ['not started', 'onboarding', 'reply', 'campaign live', 'complete'];
const newIndex = STATUS_ORDER.indexOf(newStatus);
const lastIndex = STATUS_ORDER.indexOf(lastProcessedStatus);

if (lastProcessedStatus && newIndex >= 0 && lastIndex >= 0 && newIndex < lastIndex) {
  if (newStatus === 'reply') {
    console.log(`↩️ Returning to REPLY status - allowing execution`);
    return [{ json: { ...client, skip: false } }];
  } else {
    console.log(`⬅️ Backwards status change detected (${lastProcessedStatus} → ${newStatus}) - skipping`);
    return [{ json: { ...client, skip: true, reason: `Backwards change to '${newStatus}' not allowed` } }];
  }
}

console.log(`✅ Forward progression or first execution - proceeding`);
return [{ json: { ...client, skip: false } }];