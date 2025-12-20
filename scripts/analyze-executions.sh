#!/bin/bash

# Analyze execution logs and extract key information
# Usage: ./scripts/analyze-executions.sh

set -e

COMBINED_FILE="combined-executions.json"

if [ ! -f "$COMBINED_FILE" ]; then
  echo "❌ Combined executions file not found: $COMBINED_FILE"
  echo "Run ./scripts/fetch-executions.sh first"
  exit 1
fi

echo "============================================================"
echo "n8n Execution Analysis"
echo "============================================================"
echo ""

# Summary
echo "📊 EXECUTION SUMMARY"
echo "------------------------------------------------------------"
jq -r '.executions[] | "[\(.status)] \(.workflowData.name) (ID: \(.id))\n  Started: \(.startedAt)\n  Finished: \(.finishedAt // "N/A")\n  Duration: \(if .finishedAt then (((.finishedAt | fromdateiso8601) - (.startedAt | fromdateiso8601)) | tostring + "s") else "N/A" end)\n"' "$COMBINED_FILE"

echo ""
echo "============================================================"
echo "🔍 NODE EXECUTION DETAILS"
echo "============================================================"
echo ""

# Iterate through each execution
jq -c '.executions[]' "$COMBINED_FILE" | while read -r execution; do
  WORKFLOW_NAME=$(echo "$execution" | jq -r '.workflowData.name')
  EXEC_ID=$(echo "$execution" | jq -r '.id')
  
  echo "📦 $WORKFLOW_NAME (Execution $EXEC_ID)"
  echo "------------------------------------------------------------"
  
  # Get node execution order and results
  echo "$execution" | jq -r '
    if .data.resultData.runData then
      .data.resultData.runData | to_entries[] | 
      "  \(.key):\n    Runs: \(.value | length)\n    Status: \(if (.value[-1].error) then "❌ ERROR" else "✅ SUCCESS" end)\n    Input items: \((.value[-1].data?.main?[0] // []) | length)\n    Output items: \((.value[-1].data?.main?[0] // []) | length)\n" +
      if (.value[-1].error) then
      "    Error: \(.value[-1].error.message)\n"
      else "" end
    else
      "  No execution data available"
    end
  '
  
  echo ""
done

echo "============================================================"
echo "⚠️  ERRORS AND WARNINGS"
echo "============================================================"
echo ""

# Find all errors
ERRORS=$(jq -r '.executions[] | select(.status == "error") | {
  workflow: .workflowData.name,
  id: .id,
  error: .data.resultData.error.message
}' "$COMBINED_FILE" 2>/dev/null)

if [ -z "$ERRORS" ] || [ "$ERRORS" == "null" ]; then
  echo "✅ No errors found!"
else
  echo "$ERRORS" | jq -r '"[\(.id)] \(.workflow)\n  Error: \(.error)\n"'
fi

echo ""
echo "============================================================"
echo "📊 NODE-LEVEL ERRORS"
echo "============================================================"
echo ""

# Find node-level errors
jq -r '.executions[] | 
  .workflowData.name as $workflow |
  .id as $execId |
  if .data.resultData.runData then
    .data.resultData.runData | to_entries[] | 
    select(.value[-1].error) |
    "[\($execId)] \($workflow) > \(.key)\n  Error: \(.value[-1].error.message)\n  Type: \(.value[-1].error.name // "Unknown")\n"
  else empty end
' "$COMBINED_FILE"

NODE_ERRORS=$(jq -r '.executions[] | if .data.resultData.runData then .data.resultData.runData | to_entries[] | select(.value[-1].error) else empty end' "$COMBINED_FILE" 2>/dev/null)

if [ -z "$NODE_ERRORS" ]; then
  echo "✅ No node-level errors found!"
fi

echo ""
echo "============================================================"
echo "📈 DATA FLOW"
echo "============================================================"
echo ""

# Show data flow for Main Orchestrator
echo "Main Orchestrator Data Flow:"
echo "------------------------------------------------------------"
jq -r '.executions[] | select(.workflowData.name == "Qtalo - Main Orchestrator") | 
  if .data.resultData.runData then
    .data.resultData.runData | to_entries[] |
    "  \(.key): \((.value[-1].data?.main?[0] // []) | length) items"
  else
    "  No execution data"
  end
' "$COMBINED_FILE"

echo ""
echo "Phase 1 Data Flow:"
echo "------------------------------------------------------------"
jq -r '.executions[] | select(.workflowData.name == "Qtalo - Phase 1: Import & Hygiene") | 
  if .data.resultData.runData then
    .data.resultData.runData | to_entries[] |
    "  \(.key): \((.value[-1].data?.main?[0] // []) | length) items"
  else
    "  No execution data"
  end
' "$COMBINED_FILE"

echo ""
echo "Phase 2 Data Flow:"
echo "------------------------------------------------------------"
jq -r '.executions[] | select(.workflowData.name == "Qtalo - Phase 2: Signatures & Opt-Outs") | 
  if .data.resultData.runData then
    .data.resultData.runData | to_entries[] |
    "  \(.key): \((.value[-1].data?.main?[0] // []) | length) items"
  else
    "  No execution data"
  end
' "$COMBINED_FILE"

echo ""
echo "============================================================"
echo "📄 SAMPLE OUTPUT DATA"
echo "============================================================"
echo ""

echo "Phase 1 Final Output (Create CSV Report):"
echo "------------------------------------------------------------"
jq '.executions[] | select(.workflowData.name == "Qtalo - Phase 1: Import & Hygiene") | 
  .data.resultData.runData["Create CSV Report"]?[-1]?.data?.main?[0]?[0]?.json // "No data"
' "$COMBINED_FILE"

echo ""
echo "Phase 2 Final Output (Create CSV Report):"
echo "------------------------------------------------------------"
jq '.executions[] | select(.workflowData.name == "Qtalo - Phase 2: Signatures & Opt-Outs") | 
  .data.resultData.runData["Create CSV Report"]?[-1]?.data?.main?[0]?[0]?.json // "No data"
' "$COMBINED_FILE"

echo ""
echo "============================================================"
echo "💡 ANALYSIS COMPLETE"
echo "============================================================"
echo ""
echo "For detailed inspection, use:"
echo "  jq '.executions[N]' $COMBINED_FILE  # View full execution N"
echo "  jq '.executions[N].data.resultData.runData' $COMBINED_FILE  # View all node outputs"
echo "  jq '.executions[N].data.resultData.runData[\"NodeName\"]' $COMBINED_FILE  # View specific node"
echo ""
