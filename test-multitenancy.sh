#!/bin/bash
# Multi-tenancy safeguards dry run test

CLIENT_ID="2562c7aa-40b2-4d52-9ef1-bca94fe95223"
SIGNATURE_LAMBDA_URL="https://gpmhckodqkqrbv4ho36b7ubrwa0xmncq.lambda-url.us-east-1.on.aws/"
LOG_FILE="/tmp/signature-lambda-logs.txt"

echo "=== Multi-Tenancy Safeguards Dry Run Test ==="
echo ""
echo "📋 Client ID: $CLIENT_ID"
echo "📧 Expected domain: n8n-testing.com"
echo ""

# Start CloudWatch log tail in background
echo "📜 Starting CloudWatch log tail → $LOG_FILE"
AWS_PROFILE=bla aws logs tail /aws/lambda/replyio-signature-automation \
  --follow --since 1m --region us-east-1 > "$LOG_FILE" 2>&1 &
TAIL_PID=$!
echo "   Log tail PID: $TAIL_PID"
sleep 2

echo ""
echo "=== Test 1: Valid email from n8n-testing.com (should PASS) ==="
curl -s "$SIGNATURE_LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"accounts\": [{\"email\": \"john@n8n-testing.com\", \"name\": \"John Test\"}],
    \"signature_html\": \"<p>Test signature</p>\",
    \"dry_run\": true
  }" | jq '.'
sleep 2

echo ""
echo "=== Test 2: Invalid email from malicious.com (should BLOCK) ==="
curl -s "$SIGNATURE_LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"accounts\": [{\"email\": \"attacker@malicious.com\", \"name\": \"Attacker\"}],
    \"signature_html\": \"<p>Test signature</p>\",
    \"dry_run\": true
  }" | jq '.'
sleep 2

echo ""
echo "=== Test 3: Mixed - one valid, one invalid (should process valid only) ==="
curl -s "$SIGNATURE_LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"accounts\": [
      {\"email\": \"john@n8n-testing.com\", \"name\": \"John Valid\"},
      {\"email\": \"attacker@malicious.com\", \"name\": \"Attacker\"}
    ],
    \"signature_html\": \"<p>Test signature</p>\",
    \"dry_run\": true
  }" | jq '.'

# Wait for logs to catch up
sleep 3

# Stop log tail
kill $TAIL_PID 2>/dev/null

echo ""
echo "=== CloudWatch Logs ==="
cat "$LOG_FILE" | grep -E "(expected_domains|domain|validation|BLOCK|SECURITY|DynamoDB)" | head -30

echo ""
echo "✅ Test complete! Full logs: $LOG_FILE"
