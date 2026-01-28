// Check if status is "onboarding" (case-insensitive)
const body = $input.first().json.body || {};
const historyItems = body.history_items || [];
const newStatus = (historyItems[0]?.after?.status || '').toLowerCase();

console.log('Status check - new status:', newStatus);

if (newStatus === 'onboarding') {
  // TRUE - proceed with onboarding
  return [{ json: { ...$input.first().json, isOnboarding: true } }];
} else {
  // FALSE - skip, will be routed to skip response
  return [{ json: { ...$input.first().json, isOnboarding: false } }];
}