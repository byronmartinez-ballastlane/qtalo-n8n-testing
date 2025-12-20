# Qtalo n8n Multi-Tenant Architecture

This document describes the multi-tenant architecture for managing multiple clients with isolated n8n workflows.

## Architecture Overview (Option B: Clone Workflows Per Client)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MULTI-TENANT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐     ┌────────────────────────────────────────────┐ │
│  │   TEMPLATES    │     │            PER-CLIENT WORKFLOWS             │ │
│  ├────────────────┤     ├────────────────────────────────────────────┤ │
│  │ main-orch.tmpl │────▶│ ACME Corp - Main Orchestrator              │ │
│  │ phase1.tmpl    │────▶│ ACME Corp - Phase 1: Import & Hygiene      │ │
│  │ phase2.tmpl    │────▶│ ACME Corp - Phase 2: Signatures            │ │
│  │ phase3.tmpl    │────▶│ ACME Corp - Phase 3: Standardize           │ │
│  └────────────────┘     │                                             │ │
│          │              │ Beta Inc - Main Orchestrator                │ │
│          │              │ Beta Inc - Phase 1: Import & Hygiene        │ │
│          ▼              │ Beta Inc - Phase 2: Signatures              │ │
│  ┌────────────────┐     │ Beta Inc - Phase 3: Standardize             │ │
│  │    REPLICATOR  │────▶│                                             │ │
│  │    WORKFLOW    │     │ ... (more clients)                          │ │
│  └────────────────┘     └────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                         AWS INFRASTRUCTURE                          ││
│  ├──────────────────────────┬──────────────────────────────────────────┤│
│  │   AWS Secrets Manager    │           AWS DynamoDB                   ││
│  │                          │                                          ││
│  │  n8n/clients/acme        │  qtalo-n8n-clients                       ││
│  │   - reply_api_key        │   - client_id (PK)                       ││
│  │   - clickup_api_key      │   - client_name                          ││
│  │                          │   - workflow_ids                         ││
│  │  n8n/clients/beta        │   - secrets_arn                          ││
│  │   - reply_api_key        │   - template_version                     ││
│  │   - clickup_api_key      │   - status                               ││
│  └──────────────────────────┴──────────────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Benefits of This Architecture

| Feature | Benefit |
|---------|---------|
| **Fault Isolation** | If one client's workflow fails, it doesn't affect other clients |
| **Easy Debugging** | Each client has dedicated workflows, making issues easier to trace |
| **Independent Updates** | Can update/rollback individual client workflows without affecting others |
| **Security** | Credentials are stored per-client in AWS Secrets Manager |
| **Scalability** | Add new clients without modifying existing workflows |
| **Audit Trail** | DynamoDB tracks all client configurations and versions |

## Directory Structure

```
qtalo-n8n/
├── templates/                          # Base workflow templates with placeholders
│   ├── main-orchestrator.template.json
│   ├── phase1-import-hygiene.template.json
│   ├── phase2-signatures.template.json
│   └── phase3-standardize.template.json
│
├── clients/                            # Per-client configurations
│   ├── qtalo/
│   │   └── config.json
│   ├── acme/
│   │   └── config.json
│   └── beta/
│       └── config.json
│
├── system/                             # System workflows (deployed once)
│   ├── client-onboarding.json
│   └── workflow-replicator.json
│
├── infrastructure/                     # AWS resource definitions
│   ├── dynamodb-schema.json
│   └── secrets-manager-schema.json
│
├── workflows/                          # Original workflows (for reference)
│   ├── main-orchestrator.json
│   ├── phase1-import-hygiene.json
│   ├── phase2-signatures.json
│   └── phase3-standardize.json
│
├── deploy.sh                           # Deployment script
└── MULTI-TENANT.md                     # This file
```

## Template Placeholders

Templates use the following placeholders that are replaced during client onboarding:

| Placeholder | Description | Example Value |
|-------------|-------------|---------------|
| `{{CLIENT_ID}}` | Unique client identifier | `acme`, `beta-inc` |
| `{{CLIENT_NAME}}` | Display name for the client | `ACME Corp`, `Beta Inc` |
| `{{REPLY_API_KEY}}` | Client's Reply.io API key | `vljMq...` |
| `{{CLICKUP_API_KEY}}` | Client's ClickUp API key | `pk_111...` |
| `{{PHASE1_WORKFLOW_ID}}` | ID of client's Phase 1 workflow | `abc123` |
| `{{PHASE2_WORKFLOW_ID}}` | ID of client's Phase 2 workflow | `def456` |
| `{{PHASE3_WORKFLOW_ID}}` | ID of client's Phase 3 workflow | `ghi789` |

## Quick Start

### 1. Initial Setup

```bash
# Set your n8n API key
export N8N_API_KEY="your-api-key-from-n8n-settings"

# Create AWS resources (DynamoDB table)
./deploy.sh setup

# Deploy system workflows
./deploy.sh deploy-system
```

### 2. Onboard a New Client

```bash
./deploy.sh onboard acme "ACME Corp"

# You'll be prompted for:
# - Reply.io API key
# - ClickUp API key
# - Reply.io workspace ID (optional)
# - ClickUp space ID (optional)
```

### 3. List All Clients

```bash
./deploy.sh list-clients
```

### 4. Update All Workflows (After Template Change)

```bash
./deploy.sh update-templates
```

## System Workflows

### Client Onboarding Workflow

**File:** `system/client-onboarding.json`

Triggered via webhook when onboarding a new client. Automatically:
1. Creates AWS Secrets Manager secret with credentials
2. Creates DynamoDB record
3. Clones templates for the client
4. Returns webhook URLs for the new workflows

### Workflow Replicator

**File:** `system/workflow-replicator.json`

Runs on schedule (daily) or manually. When template version changes:
1. Scans all active clients in DynamoDB
2. Checks if client needs update (compares template version)
3. Fetches credentials from Secrets Manager
4. Updates all client workflows from latest templates

## AWS Resources

### DynamoDB Table: `qtalo-n8n-clients`

| Attribute | Type | Description |
|-----------|------|-------------|
| `client_id` | String (PK) | Unique client identifier |
| `client_name` | String | Display name |
| `clickup_space_id` | String (GSI) | ClickUp space ID for lookups |
| `secrets_arn` | String | ARN of Secrets Manager secret |
| `workflow_ids` | Map | IDs of client's n8n workflows |
| `template_version` | String | Current template version (e.g., "1.0.0") |
| `status` | String | `active`, `inactive`, `suspended` |
| `created_at` | String | ISO 8601 timestamp |
| `updated_at` | String | ISO 8601 timestamp |

### Secrets Manager: `n8n/clients/{client_id}`

Each client has a secret containing:
```json
{
  "reply_api_key": "...",
  "clickup_api_key": "...",
  "reply_workspace_id": "...",
  "clickup_workspace_id": "..."
}
```

## Workflow Naming Convention

Per-client workflows follow this naming pattern:

```
<Client Name> - <Workflow Description>
```

Examples:
- `ACME Corp - Main Orchestrator`
- `ACME Corp - Phase 1: Import & Hygiene`
- `ACME Corp - Phase 2: Signatures & Opt-Outs`
- `ACME Corp - Phase 3: Standardize Workspace`

## Migrating Existing Qtalo Workflows

To migrate the existing Qtalo workflows to this architecture:

```bash
# 1. Onboard Qtalo as a client
./deploy.sh onboard qtalo "Qtalo"

# 2. When prompted, enter the existing API keys:
#    - Reply.io: vljMqVejupnbkvRNAJLPbjCM
#    - ClickUp: pk_111957980_1GNNPQ7J2RN4UF5TIU5LAB2RJIYW5T2P

# 3. The script will create:
#    - Secret: n8n/clients/qtalo
#    - DynamoDB record for Qtalo
#    - 4 new workflows: Qtalo - Main Orchestrator, etc.

# 4. (Optional) Deactivate old workflows in n8n
```

## Troubleshooting

### Common Issues

1. **"Authentication failed" errors**
   - Verify API keys are correct in Secrets Manager
   - Check n8n API key has correct permissions

2. **Workflows not updating**
   - Check template_version in DynamoDB matches expected
   - Run `./deploy.sh update-templates` manually

3. **Missing workflows**
   - Verify client exists: `./deploy.sh list-clients`
   - Check workflow_ids in DynamoDB record

### Debug Mode

Set environment variable for verbose output:
```bash
export DEBUG=1
./deploy.sh onboard test "Test Client"
```

## Security Considerations

1. **API Keys**: Never commit API keys to git. Use AWS Secrets Manager.
2. **IAM Permissions**: Restrict access to Secrets Manager and DynamoDB.
3. **n8n API Key**: Store in environment variable, not in code.
4. **Webhook URLs**: Each client gets unique webhook paths for isolation.

## Future Improvements

- [ ] Automated rollback on deployment failure
- [ ] Slack/email notifications on template updates
- [ ] Web UI for client management
- [ ] Audit logging for all operations
- [ ] Rate limiting per client
