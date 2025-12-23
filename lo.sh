 Clean up all clients
curl -s "https://zxn1hyal26.execute-api.us-east-1.amazonaws.com/prod/clients" | jq -r '.clients[].client_id' | while read id; do
  echo "Deleting client $id"
  curl -s -X DELETE "https://zxn1hyal26.execute-api.us-east-1.amazonaws.com/prod/clients/$id"
done

# Clean up all test workflows (anything with "Testing Company" in name)
curl -s "https://qtalospace.app.n8n.cloud/api/v1/workflows?limit=100" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjZkNTI3MC00YjI4LTQ0MmItYWJhZi01MjMwNGUwZTdlMGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2NDU3NjE0fQ.kUqry1F6XGZf-HEQyUYVBAqyPBbAGX42_u8EXi0YiJ8" | jq -r '.data[] | select(.name | test("Testing Company|Phase|Orchestrator")) | .id' | while read id; do
  echo "Deleting workflow $id"
  curl -s -X DELETE "https://qtalospace.app.n8n.cloud/api/v1/workflows/$id" \
    -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjZkNTI3MC00YjI4LTQ0MmItYWJhZi01MjMwNGUwZTdlMGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2NDU3NjE0fQ.kUqry1F6XGZf-HEQyUYVBAqyPBbAGX42_u8EXi0YiJ8"
done

echo "Done cleaning up"