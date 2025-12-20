# GitHub Actions Setup for Auto-Deployment

This project uses GitHub Actions to automatically deploy client workflows when new clients are onboarded via ClickUp.

## Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATED ONBOARDING FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Devin creates "Client Overview" task in ClickUp                         │
│     └── Fills in: Reply API Key, company_name, etc.                         │
│                                                                              │
│  2. ClickUp webhook → n8n Auto-Onboarding workflow                          │
│     └── Creates client in AWS (DynamoDB + Secrets Manager)                  │
│     └── Triggers GitHub Actions via repository_dispatch                     │
│                                                                              │
│  3. GitHub Actions runs deploy-client.yml                                   │
│     └── npm install                                                         │
│     └── npm run deploy -- --client=<client_id>                              │
│     └── Posts completion comment to ClickUp                                 │
│                                                                              │
│  4. User changes status to "REPLY"                                          │
│     └── ClickUp webhook → n8n Status Change Router                          │
│     └── Looks up client by task_id → Executes Phase 1/2/3                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Required Secrets

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key for deploying to DynamoDB/Secrets Manager |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `N8N_API_URL` | Your n8n instance URL (e.g., `https://qtalospace.app.n8n.cloud`) |
| `N8N_API_KEY` | n8n API key for creating workflows |
| `API_GATEWAY_URL` | AWS API Gateway URL for client management |
| `CLICKUP_API_KEY` | ClickUp API key for posting comments |

## n8n Environment Variables

The Auto-Onboarding workflow needs these variables set in n8n:

| Variable | Description |
|----------|-------------|
| `GITHUB_PAT` | GitHub Personal Access Token with `repo` and `workflow` permissions |
| `GITHUB_REPO_OWNER` | Your GitHub username or organization |
| `GITHUB_REPO_NAME` | Repository name (e.g., `qtalo-n8n`) |
| `CLICKUP_API_KEY` | ClickUp API key (shared across all clients) |

## Creating a GitHub PAT

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Select your repository
4. Under "Repository permissions":
   - **Contents**: Read and write
   - **Actions**: Read and write (to trigger workflows)
5. Generate and copy the token
6. Add it to n8n as `GITHUB_PAT` environment variable

## Manual Triggering

You can also manually trigger the workflow from GitHub:

1. Go to Actions → "Deploy Client Workflows"
2. Click "Run workflow"
3. Enter the `client_id`
4. Click "Run workflow"

Or via API:

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/OWNER/REPO/dispatches" \
  -d '{"event_type": "deploy-client", "client_payload": {"client_id": "acme-corp", "mode": "single"}}'
```

## Workflow File

The workflow is defined in `.github/workflows/deploy-client.yml` and:

1. Triggers on `repository_dispatch` event type `deploy-client`
2. Sets up Node.js 20 and installs dependencies
3. Configures AWS credentials
4. Runs `npm run deploy -- --client=<client_id>`
5. Posts success/failure comments to the ClickUp task
