const newCred = $('Create New Credential').first().json;
const transferResult = $input.first().json;

console.log(`New credential ID: ${newCred.id}`);
console.log(`Credential name: ${newCred.name}`);
console.log(`Transfer result:`, JSON.stringify(transferResult));

console.log(`Transferred: Credential ${newCred.id} (${newCred.name}) to QTalo project`);

return [{
  json: {
    new_credential_id: newCred.id,
    new_credential_name: newCred.name,
    credential_type: newCred.type,
    transferred: true
  }
}];