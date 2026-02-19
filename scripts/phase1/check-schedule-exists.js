const config = $('Prepare Schedule Config').first().json;
const existingSchedules = $input.all().map(item => item.json);
const scheduleName = config.schedule_config.name;
const forceOverwrite = config.schedule_force_overwrite;

console.log(`📅 Checking for existing schedule: "${scheduleName}"`);
console.log(`📅 Found ${existingSchedules.length} existing schedules`);

const existingSchedule = existingSchedules.find(s => s.name === scheduleName);

if (existingSchedule && !forceOverwrite) {
  console.log(`✅ Schedule "${scheduleName}" already exists (ID: ${existingSchedule.id}) - skipping creation`);
  return [{
    json: {
      ...config,
      schedule_action: 'skip',
      schedule_id: existingSchedule.id,
      schedule_message: `Schedule "${scheduleName}" already exists`,
      schedule_is_default: existingSchedule.isDefault
    }
  }];
}

if (existingSchedule && forceOverwrite) {
  console.log(`🔄 Schedule "${scheduleName}" exists but force_overwrite=true - will create new and set as default`);
}

return [{
  json: {
    ...config,
    schedule_action: 'create',
    schedule_message: existingSchedule ? 'Creating new schedule (force_overwrite)' : 'Creating new schedule'
  }
}];
