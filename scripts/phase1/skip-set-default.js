const prevData = $input.first().json;
console.log(`ℹ️ Skipping set-default (schedule_id: ${prevData.schedule_id || 'none'}, set_as_default: ${prevData.schedule_set_as_default})`);
return [{ json: { ...prevData, schedule_is_default: prevData.schedule_is_default || false } }];
