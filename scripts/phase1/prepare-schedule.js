const executionData = $input.first().json;
const config = executionData.inputData ? JSON.parse(executionData.inputData) : executionData;

const sendingSchedule = config.sending_schedule;
const companyName = config.company_name || 'Default';
const forceOverwrite = config.force_overwrite || false;

if (!sendingSchedule) {
  console.log('ℹ️ No sending_schedule configured - skipping schedule creation');
  return [{ json: { ...config, schedule_skipped: true, schedule_skip_reason: 'No sending_schedule configured' } }];
}

console.log('📅 Sending schedule configuration found:', JSON.stringify(sendingSchedule));


const scheduleName = sendingSchedule.name || `${companyName} Schedule`;
const timezone = sendingSchedule.timezone || sendingSchedule.tz || 'Eastern Standard Time';
const window = sendingSchedule.window || { start: '09:00', end: '17:00' };
const activeDays = sendingSchedule.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const setAsDefault = sendingSchedule.set_as_default !== false;

function parseTime(timeStr) {
  const [hour, minute] = (timeStr || '00:00').split(':').map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

const fromTime = parseTime(window.start);
const toTime = parseTime(window.end);

const allDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const mainTimings = allDays.map(day => ({
  weekDay: day,
  isActive: activeDays.includes(day),
  timeRanges: [{
    fromTime: activeDays.includes(day) ? fromTime : { hour: 0, minute: 0 },
    toTime: activeDays.includes(day) ? toTime : { hour: 24, minute: 0 }
  }]
}));

return [{
  json: {
    ...config,
    schedule_config: {
      name: scheduleName,
      timezoneId: timezone,
      excludeHolidays: sendingSchedule.excludeHolidays || false,
      useProspectTimezone: sendingSchedule.useProspectTimezone || true,
      useFollowUpSchedule: false,
      mainTimings: mainTimings
    },
    schedule_set_as_default: setAsDefault,
    schedule_force_overwrite: forceOverwrite
  }
}];
