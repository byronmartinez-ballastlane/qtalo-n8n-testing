const prevConfig = $('Check Schedule Exists').first().json;
const createResult = $input.first().json;

if (createResult.scheduleId) {
  console.log(`✅ Schedule created successfully with ID: ${createResult.scheduleId}`);
  return [{
    json: {
      ...prevConfig,
      schedule_id: createResult.scheduleId,
      schedule_created: true,
      schedule_message: `Schedule created with ID: ${createResult.scheduleId}`
    }
  }];
} else {
  console.error('❌ Failed to create schedule:', JSON.stringify(createResult));
  return [{
    json: {
      ...prevConfig,
      schedule_created: false,
      schedule_error: createResult.error || createResult.message || 'Unknown error',
      schedule_message: 'Failed to create schedule'
    }
  }];
}
