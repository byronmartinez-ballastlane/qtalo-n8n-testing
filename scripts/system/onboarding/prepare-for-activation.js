const injectedData = $('Inject Phase IDs to Orchestrator').first().json;

return [{
  json: {
    client_id: injectedData.client_id,
    client_name: injectedData.client_name,
    workflow_ids: injectedData.workflow_ids,
    clickup_task_id: injectedData.clickup_task_id
  }
}];