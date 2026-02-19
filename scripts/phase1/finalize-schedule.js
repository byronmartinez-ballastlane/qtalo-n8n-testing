const prevData = $('Should Set Default?').first().json;
const setDefaultResult = $input.first();

const httpStatus = setDefaultResult.json?.statusCode || 200;
const success = httpStatus >= 200 && httpStatus < 300;

if (success) {
  console.log(`✅ Schedule ${prevData.schedule_id} set as default`);
} else {
  console.warn(`⚠️ Failed to set schedule as default: ${JSON.stringify(setDefaultResult.json)}`);
}

return [{
  json: {
    ...prevData,
    schedule_is_default: success,
    schedule_default_message: success ? 'Schedule set as default' : 'Failed to set as default'
  }
}];
