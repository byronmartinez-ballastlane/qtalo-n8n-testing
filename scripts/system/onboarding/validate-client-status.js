// Check if client already exists and is active
const clientInfo = $('Extract Client Info').first().json;
const existingClient = $input.first().json;

// If client exists and is active, skip onboarding
if (existingClient.client_id && existingClient.status === 'active') {
  console.log(`⏭️ Client ${clientInfo.client_id} already exists with status 'active' - skipping onboarding`);
  return [{
    json: {
      ...clientInfo,
      skip: true,
      reason: 'Client already onboarded',
      existing_client: existingClient
    }
  }];
}

// Client doesn't exist or is not active, proceed with onboarding
console.log(`✅ Proceeding with onboarding for ${clientInfo.client_id}`);
return [{
  json: {
    ...clientInfo,
    skip: false
  }
}];