#!/bin/bash

# Fetch and combine execution logs from n8n
# Usage: ./scripts/fetch-executions.sh [number_of_executions]

set -e

# Configuration
N8N_URL="http://localhost:5678"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwNDUxNjVmYS0wODdmLTQ5MjYtYWQyMS0yYTVhNzk5ZDkwYjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYzNjQ5OTAxfQ.AxTq5Fecen__gSZ8qN72LCiD5Byr0-b6WzvpAQBo9hQ"
NUM_EXECUTIONS=${1:-4}
OUTPUT_DIR="execution-logs"
COMBINED_FILE="combined-executions.json"

echo "============================================================"
echo "n8n Execution Log Fetcher"
echo "============================================================"
echo ""
echo "Fetching last ${NUM_EXECUTIONS} executions..."
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Get list of recent executions
echo "📋 Getting execution list..."
EXECUTIONS=$(curl -s -X GET "${N8N_URL}/api/v1/executions?limit=${NUM_EXECUTIONS}" \
  -H "X-N8N-API-KEY: ${API_KEY}")

# Extract execution IDs
EXECUTION_IDS=$(echo "$EXECUTIONS" | jq -r '.data[].id' 2>/dev/null || echo "")

if [ -z "$EXECUTION_IDS" ]; then
  echo "❌ No executions found or API error"
  echo ""
  echo "Response:"
  echo "$EXECUTIONS" | jq '.' || echo "$EXECUTIONS"
  exit 1
fi

echo "Found executions:"
echo "$EXECUTION_IDS" | while read id; do
  echo "  - Execution $id"
done
echo ""

# Fetch each execution with full data
EXECUTION_DATA="[]"
COUNT=0

for EXEC_ID in $EXECUTION_IDS; do
  COUNT=$((COUNT + 1))
  echo "📥 Fetching execution ${EXEC_ID} (${COUNT}/${NUM_EXECUTIONS})..."
  
  EXEC_DETAIL=$(curl -s -X GET "${N8N_URL}/api/v1/executions/${EXEC_ID}?includeData=true" \
    -H "X-N8N-API-KEY: ${API_KEY}")
  
  # Save individual execution
  echo "$EXEC_DETAIL" > "execution_${EXEC_ID}.json"
  
  # Check if execution has error
  ERROR_MSG=$(echo "$EXEC_DETAIL" | jq -r '.data.resultData.error.message // empty' 2>/dev/null || echo "")
  WORKFLOW_NAME=$(echo "$EXEC_DETAIL" | jq -r '.workflowData.name // "Unknown"' 2>/dev/null || echo "Unknown")
  STATUS=$(echo "$EXEC_DETAIL" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
  
  echo "   Workflow: $WORKFLOW_NAME"
  echo "   Status: $STATUS"
  
  if [ -n "$ERROR_MSG" ]; then
    echo "   ⚠️  Error: $ERROR_MSG"
  fi
  
  # Add to combined array
  EXECUTION_DATA=$(echo "$EXECUTION_DATA" | jq ". += [$EXEC_DETAIL]")
  
  echo "   ✅ Saved to execution_${EXEC_ID}.json"
  echo ""
done

# Create combined file with metadata
COMBINED_DATA=$(cat <<EOF
{
  "metadata": {
    "fetched_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "total_executions": ${NUM_EXECUTIONS},
    "n8n_url": "${N8N_URL}"
  },
  "executions": $EXECUTION_DATA
}
EOF
)

echo "$COMBINED_DATA" > "../${COMBINED_FILE}"

echo "============================================================"
echo "✅ Execution logs saved!"
echo "============================================================"
echo ""
echo "📁 Individual files: ${OUTPUT_DIR}/execution_*.json"
echo "📦 Combined file: ${COMBINED_FILE}"
echo ""
echo "To view combined logs:"
echo "  jq '.' ${COMBINED_FILE}"
echo ""
echo "To extract specific workflow:"
echo "  jq '.executions[] | select(.workflowData.name == \"Qtalo - Phase 1: Import & Hygiene\")' ${COMBINED_FILE}"
echo ""
echo "To see all node outputs from an execution:"
echo "  jq '.executions[0].data.resultData.runData' ${COMBINED_FILE}"
echo ""
echo "To find errors:"
echo "  jq '.executions[] | select(.status == \"error\") | {workflow: .workflowData.name, error: .data.resultData.error.message}' ${COMBINED_FILE}"
echo ""
