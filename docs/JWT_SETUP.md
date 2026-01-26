# JWT Authentication Setup Guide

This guide explains how to set up JWT authentication between n8n workflows and the AWS API Gateway.

## Overview

The JWT authentication system provides:
- **Two-layer security**: API Key + JWT token required for all API Gateway calls
- **Auto-rotation**: Signing secret rotates every 6 hours via AWS Lambda
- **Audit trail**: JWT tokens include execution metadata for tracking

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│     n8n         │────▶│   API Gateway        │────▶│   Lambda Functions  │
│                 │     │                      │     │                     │
│ JWT Sign Node   │     │ JWT Authorizer       │     │ Client Manager      │
│ + API Key       │     │ + API Key Check      │     │ Signature Lambda    │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Secrets Manager  │
                        │                  │
                        │ JWT Signing      │
                        │ Secret           │
                        └──────────────────┘
```

## Components

### 1. AWS Secrets Manager
- **Secret Name**: `n8n/clients/qtalo/jwt-signing-secret`
- **Content**: 32-byte cryptographic secret (base64 encoded)
- **Rotation**: Every 6 hours via EventBridge + Lambda

### 2. JWT Authorizer Lambda
- **Function**: `qtalo-n8n-jwt-authorizer-prod`
- **Purpose**: Validates JWT from `Authorization: Bearer <token>` header
- **Algorithm**: HS256 (HMAC-SHA256)

### 3. Secret Rotation Lambda  
- **Function**: `qtalo-n8n-secret-rotation-prod`
- **Trigger**: EventBridge rule every 6 hours
- **Purpose**: Rotates signing secret and updates n8n credential

### 4. API Gateway
- **ID**: `r81lwr2etg`
- **URL**: `https://r81lwr2etg.execute-api.us-east-1.amazonaws.com/prod`
- **API Key**: `6kzMCd0d7Z4TgMemJ2NCT4UF3SmYVR0O2azPpuRv`

## n8n Setup Instructions

### Step 1: Create JWT Credential in n8n

1. In n8n, go to **Credentials** → **Add Credential**
2. Search for "JWT" and select it
3. Configure:
   - **Name**: `AWS API Gateway JWT`
   - **Key Type**: `Passphrase`
   - **Passphrase Secret**: Get from AWS Secrets Manager (see below)
   - **Algorithm**: `HS256`
4. Save the credential

### Step 2: Get Current Signing Secret

Run this command to get the current signing secret:

```bash
aws secretsmanager get-secret-value \
  --secret-id n8n/clients/qtalo/jwt-signing-secret \
  --profile bla \
  --query SecretString \
  --output text
```

Copy the value and paste it into the n8n JWT credential's "Passphrase Secret" field.

### Step 3: Get n8n Credential ID

After creating the credential, get its ID:

1. Go to n8n credentials list
2. Click on the JWT credential
3. Note the credential ID from the URL: `https://qtalospace.app.n8n.cloud/credentials/{CREDENTIAL_ID}`

### Step 4: Configure Auto-Rotation (Optional)

To enable automatic credential updates when the secret rotates:

1. Update the secret-rotation Lambda environment variables:
   ```bash
   cd infrastructure/terraform
   terraform apply -var="n8n_jwt_credential_id=YOUR_CREDENTIAL_ID"
   ```

2. Set up n8n API access for the rotation Lambda (requires n8n API key)

## Using JWT in Workflows

### JWT Sign Node Configuration

Add a JWT Sign node before any API Gateway HTTP Request:

```json
{
  "parameters": {
    "operation": "sign",
    "payload": "={{ JSON.stringify({ sub: 'workflow-name', iss: 'n8n-qtalo', aud: 'qtalo-api-gateway', jti: $execution.id, iat: Math.floor(Date.now() / 1000) }) }}",
    "expiresIn": 3600,
    "options": {}
  },
  "credentials": {
    "jwtAuth": {
      "id": "YOUR_CREDENTIAL_ID",
      "name": "AWS API Gateway JWT"
    }
  }
}
```

### HTTP Request Node Configuration

Add headers to your API Gateway calls:

```json
{
  "headerParameters": {
    "parameters": [
      { "name": "Authorization", "value": "=Bearer {{ $json.token }}" },
      { "name": "x-api-key", "value": "6kzMCd0d7Z4TgMemJ2NCT4UF3SmYVR0O2azPpuRv" }
    ]
  }
}
```

## JWT Token Claims

The JWT payload should include:

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | Subject (workflow identifier) | `n8n-status-router` |
| `iss` | Issuer | `n8n-qtalo` |
| `aud` | Audience | `qtalo-api-gateway` |
| `jti` | JWT ID (unique token ID) | `execution-id` |
| `iat` | Issued At (timestamp) | `1704067200` |
| `exp` | Expiration (auto-set by expiresIn) | `1704070800` |

## Template Files

### Updated Templates with JWT

- `templates/status-router-jwt.template.json` - Status router with JWT authentication
- `templates/phase2-signatures-jwt.template.json` - Phase 2 with JWT for Lambda calls (if needed)

### Placeholders to Replace

When deploying templates, replace these placeholders:

| Placeholder | Description | Value |
|-------------|-------------|-------|
| `{{JWT_CREDENTIAL_ID}}` | n8n JWT credential ID | Your credential ID |
| `{{API_GATEWAY_KEY}}` | API Gateway API key | `6kzMCd0d7Z4TgMemJ2NCT4UF3SmYVR0O2azPpuRv` |
| `{{CLICKUP_CREDENTIAL_ID}}` | n8n ClickUp credential ID | Your credential ID |

## Troubleshooting

### "Unauthorized" Error (401)

1. Check JWT token is being sent in Authorization header
2. Verify signing secret matches between n8n and Secrets Manager
3. Check token hasn't expired (1 hour default)

### "Forbidden" Error (403)  

1. Verify API key is correct and being sent
2. Check API key has not been revoked
3. Verify usage plan limits haven't been exceeded

### Token Validation Failed

1. Secret may have rotated - update n8n credential with new secret
2. Check algorithm is set to HS256
3. Verify payload is valid JSON

## Security Best Practices

1. **Never commit secrets** - Use environment variables or credential stores
2. **Use short expiration** - 1 hour maximum for JWT tokens
3. **Include audit claims** - Always set jti, iat for tracking
4. **Monitor rotation** - Set up CloudWatch alarms for rotation failures
5. **Rotate on compromise** - Can force rotation via Lambda console

## Related Files

- `/infrastructure/jwt-authorizer/index.js` - JWT Authorizer Lambda
- `/infrastructure/secret-rotation/index.js` - Secret Rotation Lambda
- `/infrastructure/terraform/jwt-auth.tf` - Terraform configuration
- `/infrastructure/terraform/api-gateway.tf` - API Gateway with auth
