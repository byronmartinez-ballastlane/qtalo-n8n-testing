#!/bin/bash
# Cleanup script for qtalo-n8n test data
# Run this to reset the environment before testing

set -e

N8N_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjZkNTI3MC00YjI4LTQ0MmItYWJhZi01MjMwNGUwZTdlMGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2NDU3NjE0fQ.kUqry1F6XGZf-HEQyUYVBAqyPBbAGX42_u8EXi0YiJ8"
N8N_BASE="https://qtalospace.app.n8n.cloud/api/v1"
LAMBDA_API="https://zxn1hyal26.execute-api.us-east-1.amazonaws.com/prod"
AWS_REGION="us-east-1"
KEEP_EXECUTIONS=20

echo "🧹 Starting cleanup..."

# ============================================================
# 1. Delete all clients from DynamoDB via Lambda API
# ============================================================
echo ""
echo "📦 Cleaning up DynamoDB clients..."
CLIENT_IDS=$(curl -s "$LAMBDA_API/clients" | jq -r '.clients[].client_id // empty' 2>/dev/null)

if [ -z "$CLIENT_IDS" ]; then
  echo "   No clients found in DynamoDB"
else
  echo "$CLIENT_IDS" | while read id; do
    if [ -n "$id" ]; then
      echo "   Deleting client: $id"
      curl -s -X DELETE "$LAMBDA_API/clients/$id" > /dev/null
    fi
  done
  echo "   ✅ DynamoDB clients deleted"
fi

# ============================================================
# 2. Delete client secrets from AWS Secrets Manager
# ============================================================
echo ""
echo "🔐 Cleaning up AWS Secrets..."
SECRETS=$(aws secretsmanager list-secrets --region $AWS_REGION --query 'SecretList[].Name' --output text 2>/dev/null | tr '\t' '\n' | grep "^n8n/clients/" || true)

if [ -z "$SECRETS" ]; then
  echo "   No client secrets found"
else
  echo "$SECRETS" | while read secret; do
    if [ -n "$secret" ]; then
      echo "   Deleting secret: $secret"
      aws secretsmanager delete-secret \
        --secret-id "$secret" \
        --force-delete-without-recovery \
        --region $AWS_REGION > /dev/null 2>&1 || true
    fi
  done
  echo "   ✅ AWS Secrets deleted"
fi

# ============================================================
# 3. Delete test workflows from n8n (client-generated ones)
# ============================================================
echo ""
echo "🔄 Cleaning up n8n test workflows..."
WORKFLOW_IDS=$(curl -s "$N8N_BASE/workflows?limit=100" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq -r '.data[] | select(.name | test("Testing Company|Another n8n|Phase [0-9]|Orchestrator"; "i")) | .id // empty' 2>/dev/null)

if [ -z "$WORKFLOW_IDS" ]; then
  echo "   No test workflows found"
else
  echo "$WORKFLOW_IDS" | while read id; do
    if [ -n "$id" ]; then
      echo "   Deleting workflow: $id"
      curl -s -X DELETE "$N8N_BASE/workflows/$id" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" > /dev/null
    fi
  done
  echo "   ✅ n8n test workflows deleted"
fi

# ============================================================
# 4. Delete test credentials from n8n (client-generated ones)
#    Note: n8n API doesn't support listing credentials, 
#    so we delete known test credential IDs if they exist
# ============================================================
echo ""
echo "🔑 Cleaning up n8n test credentials..."
# Known test credential IDs can be added here as they're created
# For now, we skip this since credentials can't be listed via API
echo "   ⚠️  n8n API doesn't support listing credentials - skipping"
echo "   (Delete manually in n8n UI if needed)"

# ============================================================
# 5. Prune old executions (keep only last 20)
# ============================================================
echo ""
echo "📜 Pruning old executions (keeping last $KEEP_EXECUTIONS)..."

# Get all executions sorted by date (newest first), skip first 20, delete the rest
ALL_EXECUTION_IDS=$(curl -s "$N8N_BASE/executions?limit=500" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq -r '.data | sort_by(.startedAt) | reverse | .['"$KEEP_EXECUTIONS"':] | .[].id // empty' 2>/dev/null)

if [ -z "$ALL_EXECUTION_IDS" ]; then
  echo "   No old executions to delete"
else
  DELETE_COUNT=0
  echo "$ALL_EXECUTION_IDS" | while read id; do
    if [ -n "$id" ]; then
      curl -s -X DELETE "$N8N_BASE/executions/$id" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" > /dev/null
      DELETE_COUNT=$((DELETE_COUNT + 1))
    fi
  done
  TOTAL=$(echo "$ALL_EXECUTION_IDS" | wc -l | tr -d ' ')
  echo "   ✅ Deleted $TOTAL old executions"
fi

# ============================================================
# 6. Reset Status Change Router staticData (clear dedup cache)
# ============================================================
echo ""
echo "🔃 Resetting Status Change Router staticData..."
STATUS_ROUTER_ID="aHhgGkrbTKvywIJk"

# Get current workflow
WORKFLOW_JSON=$(curl -s "$N8N_BASE/workflows/$STATUS_ROUTER_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY")

# Check if workflow exists
if echo "$WORKFLOW_JSON" | jq -e '.id' > /dev/null 2>&1; then
  # Update with null staticData
  UPDATED_JSON=$(echo "$WORKFLOW_JSON" | jq '.staticData = null')
  
  curl -s -X PUT "$N8N_BASE/workflows/$STATUS_ROUTER_ID" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_JSON" > /dev/null
  
  echo "   ✅ Status Change Router staticData reset"
else
  echo "   ⚠️  Status Change Router workflow not found"
fi

echo ""
echo "✅ Cleanup complete! Ready for fresh testing."