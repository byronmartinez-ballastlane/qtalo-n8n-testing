# QTalo n8n Deployment System

This folder contains scripts and configuration for deploying n8n system workflows with externalized JavaScript code and configuration management.

## Overview

The deployment system separates concerns:
- **Templates** (`system/*.template.json`) - Workflow definitions with placeholders
- **Scripts** (`scripts/system/`) - Externalized JavaScript code
- **Config** - Values stored in AWS SSM Parameter Store (or `.env` for local dev)

## Architecture

```
qtalo-n8n/
├── system/
│   ├── *.json                    # Rendered workflows (for reference)
│   └── *.template.json           # Templates with placeholders
├── scripts/
│   └── system/
│       ├── onboarding/           # 11 JS files from client-onboarding-v2
│       ├── router/               # 5 JS files from status-change-router
│       └── jwt-rotation/         # 8 JS files from system-jwt-rotation
└── deploy/
    ├── deploy.py                 # Main deployment script
    ├── extract_jscode.py         # Extract JS from workflows
    ├── config.json               # SSM parameter mapping
    └── requirements.txt          # Python dependencies
```

## Placeholder Types

### 1. Configuration Placeholders (`{{VAR_NAME}}`)

Replaced at deploy time with values from SSM or `.env`:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{N8N_API_URL}}` | n8n Cloud API URL | `https://qtalospace.app.n8n.cloud/api/v1` |
| `{{N8N_HOST}}` | n8n hostname | `qtalospace.app.n8n.cloud` |
| `{{N8N_PROJECT_ID}}` | QTalo project ID | `BFIDAvXOISVZh7tb` |
| `{{AWS_API_GATEWAY_URL}}` | AWS API Gateway base URL | `https://xxx.execute-api.us-east-1.amazonaws.com/prod` |
| `{{CLICKUP_API_URL}}` | ClickUp API URL | `https://api.clickup.com/api/v2` |
| `{{GITHUB_CREDENTIAL_ID}}` | n8n GitHub credential ID | `Q6oSPWOEORCm73TJ` |
| `{{N8N_CREDENTIAL_ID}}` | n8n API credential ID | `EaOQcyWDYyvGbbr7` |
| `{{CLICKUP_SYSTEM_CREDENTIAL_ID}}` | System ClickUp credential ID | `KQ4DCkxv3kBoRgK1` |
| `{{GITHUB_OWNER}}` | GitHub repo owner | `byronmartinez-ballastlane` |
| `{{GITHUB_REPO}}` | GitHub repo name | `qtalo-n8n-testing` |

### 2. JS Injection Placeholders (`{{INJECT:path}}`)

Replaced at deploy time with file contents (properly escaped for JSON):

```json
"jsCode": "{{INJECT:scripts/system/onboarding/extract-client-info.js}}"
```

### 3. Runtime Placeholders (NOT replaced at deploy time)

These are kept as-is and replaced at workflow execution time for each client:

| Placeholder | Description |
|-------------|-------------|
| `{{CLIENT_ID}}` | Client UUID |
| `{{CLIENT_NAME}}` | Client name |
| `{{CLICKUP_CREDENTIAL_ID}}` | Client's ClickUp credential |
| `{{REPLY_CREDENTIAL_ID}}` | Client's Reply.io credential |
| `{{PHASE1_WORKFLOW_ID}}` | Phase 1 workflow ID |
| `{{PHASE2_WORKFLOW_ID}}` | Phase 2 workflow ID |
| `{{PHASE3_WORKFLOW_ID}}` | Phase 3 workflow ID |

## Scripts

### deploy.py

Main deployment script with multiple modes:

```bash
# Install dependencies first
pip install -r requirements.txt

# Create templates from existing workflows (adds config placeholders)
python deploy.py --create-templates

# Preview rendered output (uses local .env)
python deploy.py --preview --local

# Preview and output to system/ folder
python deploy.py --preview --local --output system/

# Deploy to n8n using SSM config
python deploy.py --deploy

# Deploy using local .env config
python deploy.py --deploy --local

# Deploy specific workflow
python deploy.py --deploy --local --workflow client-onboarding
```

### extract_jscode.py

Extracts inline JavaScript from workflows into separate files:

```bash
# Extract from regular JSON files
python extract_jscode.py

# Extract from template files (preserves config placeholders)
python extract_jscode.py --from-templates

# Preview without writing files
python extract_jscode.py --dry-run
```

## Workflow: Making Changes

### Modifying JavaScript Code

1. Edit the JS file in `scripts/system/<category>/<name>.js`
2. Run preview to verify: `python deploy.py --preview --local`
3. Compare with original: `diff <(jq -S '.' system/xxx.json) <(jq -S '.' deploy/rendered/xxx.rendered.json)`
4. Deploy: `python deploy.py --deploy --local`

### Adding New System Workflows

1. Create workflow in n8n, export as JSON to `system/`
2. Run `python deploy.py --create-templates` to add config placeholders
3. Run `python extract_jscode.py --from-templates` to extract JS
4. Verify with `python deploy.py --preview --local`

### Changing Configuration Values

For local development, update `.env` file. For production, update SSM parameters.

## SSM Parameter Store Structure

Parameters are organized under `/qtalo/` prefix:

```
/qtalo/n8n/api_url
/qtalo/n8n/api_key
/qtalo/n8n/host
/qtalo/n8n/project_id
/qtalo/n8n/credentials/github_id
/qtalo/n8n/credentials/n8n_api_id
/qtalo/n8n/credentials/clickup_system_id
/qtalo/aws/api_gateway_url
/qtalo/aws/api_key
/qtalo/clickup/api_url
/qtalo/github/owner
/qtalo/github/repo
```

## System Workflows

| Workflow | Purpose | JS Files |
|----------|---------|----------|
| `client-onboarding-v2` | Creates client workflows from templates | 11 |
| `status-change-router` | Routes ClickUp status changes to phases | 5 |
| `system-jwt-rotation` | Rotates JWT tokens for n8n API | 8 |

## File Naming Conventions

- Templates: `{workflow-name}.template.json`
- Rendered: `{workflow-name}.rendered.json` (in deploy/rendered/)
- JS files: `{node-name-kebab-case}.js`

## Dependencies

- Python 3.8+
- `python-dotenv` - Load .env files
- `boto3` - AWS SSM access (for production)
- `requests` - n8n API calls

## Notes

- The `.json` files in `system/` are the "source of truth" for comparison
- Templates are smaller than rendered files (JS is externalized)
- Always verify rendered output matches originals before deploying
- Runtime placeholders are replaced by the client-onboarding workflow when creating client-specific workflows
