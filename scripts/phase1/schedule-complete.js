// Merge schedule branch results and continue to mailbox processing
// This node receives from either the schedule creation branch or the skip branch
const scheduleResult = $input.first().json;

console.log('📅 Schedule management complete:');
console.log(`   - Action: ${scheduleResult.schedule_action || 'skipped'}`);
console.log(`   - ID: ${scheduleResult.schedule_id || 'none'}`);
console.log(`   - Is Default: ${scheduleResult.schedule_is_default || false}`);
console.log(`   - Message: ${scheduleResult.schedule_message || 'No schedule configured'}`);

// Pass the full config to the mailbox processing branch
return [{ json: scheduleResult }];
