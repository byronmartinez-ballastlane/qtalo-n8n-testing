const data = $input.first().json;

return {
  json: {
    success: true,
    message: 'Client already onboarded',
    client_id: data.client_id,
    client_name: data.client_name,
    existing_client: data.existing_client
  }
};