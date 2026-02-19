const clientInfo = $('Extract Client Info').first().json;
const clickupCred = $('Create ClickUp Credential').first().json;
const replyCred = $('Create Reply Credential').first().json;

return [{
  json: {
    ...clientInfo,
    clickup_credential_id: clickupCred.id,
    clickup_credential_name: clickupCred.name,
    reply_credential_id: replyCred.id,
    reply_credential_name: replyCred.name
  }
}];