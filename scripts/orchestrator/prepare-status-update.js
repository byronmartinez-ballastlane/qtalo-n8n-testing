// Prepare final status update for ClickUp task
const taskId = $('Get Task Details').first().json.id;

return [{
  json: {
    taskId,
    statusName: 'complete'
  }
}];
