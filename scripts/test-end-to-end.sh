#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "End-to-End Test: ClickUp → n8n → Reply.io"
echo "============================================================"
echo ""

# Configuration
N8N_URL="http://localhost:5678"
WEBHOOK_PATH="clickup-reply-setup"
REPLY_API_KEY="vljMqVejupnbkvRNAJLPbjCM"
CLICKUP_TASK_ID="86acb0atg"

echo "📋 Step 1: Check n8n is running..."
if curl -s "$N8N_URL/healthz" | grep -q "ok"; then
    echo -e "${GREEN}✅ n8n is running${NC}"
else
    echo -e "${RED}❌ n8n is not running. Please start it with: docker compose up -d${NC}"
    exit 1
fi
echo ""

echo "📋 Step 2: Check Reply.io API connection..."
REPLY_TEST=$(curl -s -w "\n%{http_code}" -X GET "https://api.reply.io/v1/emailAccounts" \
    -H "x-api-key: $REPLY_API_KEY")
HTTP_CODE=$(echo "$REPLY_TEST" | tail -1)
REPLY_RESPONSE=$(echo "$REPLY_TEST" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Reply.io API connected${NC}"
    echo "Current email accounts in Reply.io:"
    echo "$REPLY_RESPONSE" | jq -r '.emailAddress // .id' 2>/dev/null || echo "$REPLY_RESPONSE"
else
    echo -e "${RED}❌ Reply.io API error (HTTP $HTTP_CODE)${NC}"
    echo "$REPLY_RESPONSE"
fi
echo ""

echo "📋 Step 3: Trigger workflow via webhook..."
TRIGGER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$N8N_URL/webhook/$WEBHOOK_PATH" \
    -H "Content-Type: application/json" \
    -d "{
        \"event\": \"taskUpdated\",
        \"task_id\": \"$CLICKUP_TASK_ID\",
        \"list_id\": \"901320739806\",
        \"webhook_id\": \"test-webhook-$(date +%s)\"
    }")

HTTP_CODE=$(echo "$TRIGGER_RESPONSE" | tail -1)
TRIGGER_MSG=$(echo "$TRIGGER_RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Workflow triggered successfully${NC}"
    echo "$TRIGGER_MSG"
else
    echo -e "${RED}❌ Failed to trigger workflow (HTTP $HTTP_CODE)${NC}"
    echo "$TRIGGER_MSG"
    exit 1
fi
echo ""

echo "⏳ Waiting 8 seconds for workflow execution..."
sleep 8
echo ""

echo "📋 Step 4: Fetch execution logs..."
./scripts/fetch-executions.sh 4
echo ""

echo "📋 Step 5: Analyze execution results..."
./scripts/analyze-executions.sh | head -100
echo ""

echo "📋 Step 6: Check Reply.io for changes..."
echo "Fetching email accounts from Reply.io..."
REPLY_ACCOUNTS=$(curl -s -X GET "https://api.reply.io/v1/emailAccounts" \
    -H "x-api-key: $REPLY_API_KEY")

echo -e "${YELLOW}Email accounts in Reply.io:${NC}"
echo "$REPLY_ACCOUNTS" | jq -r 'if type == "array" then .[] else . end | "  • \(.emailAddress // .Email) - \(.senderName // .SenderName) (ID: \(.id))"' 2>/dev/null || echo "$REPLY_ACCOUNTS"
echo ""

echo "📋 Step 7: Check for signatures..."
echo "$REPLY_ACCOUNTS" | jq -r 'if type == "array" then .[] else . end | select(.signature != null and .signature != "") | "  • \(.emailAddress): \(.signature | .[0:50])..."' 2>/dev/null || echo "  (No signatures found or error parsing)"
echo ""

echo "============================================================"
echo "Test Summary"
echo "============================================================"
echo ""
echo "✅ What to verify manually:"
echo "1. Open n8n: http://localhost:5678/workflows"
echo "   - Check 'Qtalo - Main Orchestrator' execution history"
echo "   - Verify all 4 workflows executed successfully"
echo ""
echo "2. Open Reply.io: https://reply.io"
echo "   - Go to Settings → Email Accounts"
echo "   - Verify email accounts were created/updated"
echo "   - Check if signatures were applied (likely NOT via API)"
echo ""
echo "3. Open ClickUp task:"
echo "   - Check if comments were posted with execution results"
echo "   - Verify CSV reports were attached (if implemented)"
echo ""
echo "============================================================"
