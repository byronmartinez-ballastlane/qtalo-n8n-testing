const statusData = $('Check Status Progression').first().json;

return [{
  json: {
    task_id: statusData.task_id,
    client_id: statusData.client_id,
    client_name: statusData.client_name,
    workflow_ids: statusData.workflow_ids,
    new_status: $('Parse Webhook').first().json.new_status
  }
}];