const body = $input.first().json.body || {};
const historyItems = body.history_items || [];
const newStatus = (historyItems[0]?.after?.status || '').toLowerCase();

console.log('Status check - new status:', newStatus);

if (newStatus === 'onboarding') {
  return [{ json: { ...$input.first().json, isOnboarding: true } }];
} else {
  return [{ json: { ...$input.first().json, isOnboarding: false } }];
}