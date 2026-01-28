// Find the credential ID by scanning workflows for a credential with the target name
// Also identify all workflows that use this credential
const requestData = $('Validate Request').first().json;
const workflows = $input.all().map(i => i.json);
const targetName = requestData.credential_name;

let foundCredId = null;
let foundCredType = null;
const workflowsUsingCred = [];

for (const wf of workflows) {
  if (!wf.nodes) continue;
  
  for (const node of wf.nodes) {
    if (!node.credentials) continue;
    
    for (const [credType, credInfo] of Object.entries(node.credentials)) {
      if (credInfo.name === targetName) {
        foundCredId = credInfo.id;
        foundCredType = credType;
        
        // Add workflow ID to list if not already there
        if (!workflowsUsingCred.find(w => w === wf.id)) {
          workflowsUsingCred.push(wf.id);
        }
      }
    }
  }
}

if (!foundCredId) {
  throw new Error(`Credential not found in any workflow: ${targetName}`);
}

// Prepare credential data based on type
let credentialData;
if (foundCredType === 'jwtAuth') {
  credentialData = { keyType: 'passphrase', secret: requestData.new_jwt_token, privateKey: '', publicKey: '', algorithm: 'HS256' };
} else {
  credentialData = { name: 'Authorization', value: 'Bearer ' + requestData.new_jwt_token };
}

console.log(`Found credential ID: ${foundCredId} (${targetName}) of type ${foundCredType}`);
console.log(`Found ${workflowsUsingCred.length} workflows using this credential: ${workflowsUsingCred.join(', ')}`);

return [{
  json: {
    old_credential_id: foundCredId,
    old_credential_name: targetName,
    credential_type: foundCredType,
    credential_data_json: JSON.stringify(credentialData),
    new_jwt_token: requestData.new_jwt_token,
    workflow_ids: workflowsUsingCred,
    workflows_count: workflowsUsingCred.length
  }
}];