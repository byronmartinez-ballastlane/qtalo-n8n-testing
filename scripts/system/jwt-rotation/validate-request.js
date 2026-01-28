// Validate rotation request from Lambda
const body = $input.first().json.body;

const newJwtToken = body.new_jwt_token;
const credentialName = body.credential_name;

if (!newJwtToken || !credentialName) {
  throw new Error('Missing required: new_jwt_token and credential_name');
}

console.log(`JWT Rotation requested for credential: ${credentialName}`);

return [{
  json: {
    new_jwt_token: newJwtToken,
    credential_name: credentialName
  }
}];