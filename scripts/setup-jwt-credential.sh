#!/bin/bash
# JWT Credential Setup Script for n8n
# This script retrieves the JWT signing secret and provides setup instructions

set -e

# Configuration
AWS_PROFILE="${AWS_PROFILE:-bla}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SECRET_NAME="n8n/clients/qtalo/jwt-signing-secret"
API_GATEWAY_URL="https://zxn1hyal26.execute-api.us-east-1.amazonaws.com/prod"
API_KEY="3fTQPitk0R8ZrD1lWt5gX7zAUqyuqwII2Gxf8Llj"
N8N_INSTANCE_URL="${N8N_INSTANCE_URL:-https://qtalospace.app.n8n.cloud}"

echo "=========================================="
echo "🔐 JWT Credential Setup for n8n"
echo "=========================================="
echo ""

# Check AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
echo "🔍 Checking AWS credentials..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
    echo "❌ AWS credentials not configured for profile: $AWS_PROFILE"
    echo "   Run: aws configure --profile $AWS_PROFILE"
    exit 1
fi
echo "✅ AWS credentials OK"
echo ""

# Get the signing secret
echo "📥 Retrieving JWT signing secret from AWS Secrets Manager..."
SECRET_VALUE=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query SecretString \
    --output text 2>/dev/null)

if [ -z "$SECRET_VALUE" ]; then
    echo "❌ Failed to retrieve secret from: $SECRET_NAME"
    exit 1
fi
echo "✅ Secret retrieved successfully"
echo ""

# Extract the actual secret value (it's JSON)
SIGNING_SECRET=$(echo "$SECRET_VALUE" | jq -r '.secret // .' 2>/dev/null || echo "$SECRET_VALUE")

echo "=========================================="
echo "📋 n8n JWT Credential Configuration"
echo "=========================================="
echo ""
echo "Follow these steps in n8n:"
echo ""
echo "1. Go to: ${N8N_INSTANCE_URL}/credentials"
echo ""
echo "2. Click 'Add Credential' → Search 'JWT'"
echo ""
echo "3. Configure the credential:"
echo "   ┌────────────────────────────────────────┐"
echo "   │ Name:             AWS API Gateway JWT  │"
echo "   │ Key Type:         Passphrase           │"
echo "   │ Algorithm:        HS256                │"
echo "   └────────────────────────────────────────┘"
echo ""
echo "4. Passphrase Secret (copy this entire value):"
echo "   ┌────────────────────────────────────────┐"
echo "   │ $SIGNING_SECRET"
echo "   └────────────────────────────────────────┘"
echo ""
echo "5. Click 'Create' to save the credential"
echo ""

echo "=========================================="
echo "📋 API Gateway Configuration"
echo "=========================================="
echo ""
echo "API Gateway URL: $API_GATEWAY_URL"
echo "API Key:         $API_KEY"
echo ""

echo "=========================================="
echo "📋 Template Placeholders to Replace"
echo "=========================================="
echo ""
echo "After creating the credential, note its ID from the URL and replace:"
echo ""
echo "  {{JWT_CREDENTIAL_ID}}    → Your new credential ID"
echo "  {{API_GATEWAY_KEY}}      → $API_KEY"
echo ""

# Generate test curl command
echo "=========================================="
echo "🧪 Test Commands"
echo "=========================================="
echo ""
echo "Test JWT generation (requires jq and openssl):"
echo ""
echo "# Generate a test JWT token"
cat << 'EOF'
HEADER=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
PAYLOAD=$(echo -n "{\"sub\":\"test\",\"iss\":\"n8n-qtalo\",\"aud\":\"qtalo-api-gateway\",\"iat\":$(date +%s),\"exp\":$(($(date +%s)+3600))}" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
EOF
echo "SECRET=\"$SIGNING_SECRET\""
cat << 'EOF'
SIGNATURE=$(echo -n "${HEADER}.${PAYLOAD}" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
TOKEN="${HEADER}.${PAYLOAD}.${SIGNATURE}"
echo "JWT Token: $TOKEN"
EOF
echo ""
echo "# Test API call with JWT"
echo "curl -H \"Authorization: Bearer \$TOKEN\" \\"
echo "     -H \"x-api-key: $API_KEY\" \\"
echo "     \"$API_GATEWAY_URL/health\""
echo ""

echo "=========================================="
echo "✅ Setup instructions complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create the JWT credential in n8n (see instructions above)"
echo "2. Note the credential ID"
echo "3. Deploy templates with: ./scripts/deploy-workflows.sh"
echo "4. Test the status-router workflow"
echo ""
