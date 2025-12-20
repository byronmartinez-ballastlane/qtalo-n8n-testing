# GitHub Actions Setup

## Overview

The repository uses branch-based deployments to a **single n8n Cloud instance**:

- **`dev` branch** → Deploys as `[DEV] Workflow Name`
- **`staging` branch** → Deploys as `[STAGING] Workflow Name`
- **`main` branch** → Deploys as `[PROD] Workflow Name`

All environments coexist in the same n8n Cloud instance, differentiated by workflow name prefixes.

## Setup

### 1. Create GitHub Environments

Go to **Repository Settings → Environments** and create:

#### Development Environment
- Name: `development`
- Secrets:
  ```
  N8N_API_URL=https://your-instance.app.n8n.cloud/api/v1
  N8N_API_KEY=n8n_api_xxxxxxxxxxxxx
  CLICKUP_API_KEY=pk_dev_xxxxxxxxxxxxx
  REPLY_API_KEY=dev_xxxxxxxxxxxxx
  CLICKUP_TEAM_ID=<dev_workspace_team_id>
  CLICKUP_SPACE_ID=<dev_workspace_space_id>
  CLICKUP_FOLDER_ID=<dev_workspace_folder_id>
  CLICKUP_LIST_ID=<dev_workspace_list_id>
  ```

#### Staging Environment
- Name: `staging`
- Secrets: (same structure, different values)
  ```
  N8N_API_URL=https://your-instance.app.n8n.cloud/api/v1
  N8N_API_KEY=n8n_api_xxxxxxxxxxxxx (same n8n instance)
  CLICKUP_API_KEY=pk_staging_xxxxxxxxxxxxx
  REPLY_API_KEY=staging_xxxxxxxxxxxxx
  CLICKUP_TEAM_ID=<staging_workspace_team_id>
  CLICKUP_SPACE_ID=<staging_workspace_space_id>
  CLICKUP_FOLDER_ID=<staging_workspace_folder_id>
  CLICKUP_LIST_ID=<staging_workspace_list_id>
  ```

#### Production Environment
- Name: `production`
- Protection rules: ✅ Require approval from reviewers
- Secrets: (same structure, different values)
  ```
  N8N_API_URL=https://your-instance.app.n8n.cloud/api/v1
  N8N_API_KEY=n8n_api_xxxxxxxxxxxxx (same n8n instance)
  CLICKUP_API_KEY=pk_prod_xxxxxxxxxxxxx
  REPLY_API_KEY=prod_xxxxxxxxxxxxx
  CLICKUP_TEAM_ID=<prod_workspace_team_id>
  CLICKUP_SPACE_ID=<prod_workspace_space_id>
  CLICKUP_FOLDER_ID=<prod_workspace_folder_id>
  CLICKUP_LIST_ID=<prod_workspace_list_id>
  ```

### 2. Create Branches

```bash
# Create dev branch
git checkout -b dev
git push origin dev

# Create staging branch
git checkout -b staging
git push origin staging

# Main branch (already exists as production)
```

### 3. Set Branch Protection

**Settings → Branches → Add rule:**

For `main` (production):
- ✅ Require pull request reviews (1 approval)
- ✅ Require status checks (GitHub Actions must pass)
- ✅ Include administrators

For `staging`:
- ✅ Require status checks

For `dev`:
- No protection (fast iteration)

## Workflow

### Development Workflow

```bash
# Work on feature
git checkout dev
# Make changes to workflows/
git add workflows/
git commit -m "Add new feature"
git push origin dev
# ✅ Auto-deploys as [DEV] workflows
```

### Promoting to Staging

```bash
# Merge dev → staging
git checkout staging
git merge dev
git push origin staging
# ✅ Auto-deploys as [STAGING] workflows
```

### Promoting to Production

```bash
# Create PR: staging → main
gh pr create --base main --head staging --title "Release v1.2.3"
# Get approval
# Merge PR
# ✅ Auto-deploys as [PROD] workflows
```

## n8n Cloud Structure

After full deployment, your n8n instance will have:

```
Workflows:
├── [DEV] Main Orchestrator
├── [DEV] Phase 1: Import & Hygiene
├── [DEV] Phase 2: Signatures & Opt-Outs
├── [DEV] Phase 3: Standardize Workspace
├── [STAGING] Main Orchestrator
├── [STAGING] Phase 1: Import & Hygiene
├── [STAGING] Phase 2: Signatures & Opt-Outs
├── [STAGING] Phase 3: Standardize Workspace
├── [PROD] Main Orchestrator
├── [PROD] Phase 1: Import & Hygiene
├── [PROD] Phase 2: Signatures & Opt-Outs
└── [PROD] Phase 3: Standardize Workspace
```

**Each environment:**
- Has its own ClickUp workspace (different team/space/list IDs)
- Uses its own API keys
- Operates independently

## Manual Deployment

For local testing or emergency fixes:

```bash
# Deploy to dev
WORKFLOW_PREFIX="[DEV]" npm run deploy

# Deploy to staging
WORKFLOW_PREFIX="[STAGING]" npm run deploy

# Deploy to production
WORKFLOW_PREFIX="[PROD]" npm run deploy
```

## Activation Strategy

**n8n Cloud workflows:**
- Only activate `[PROD] Main Orchestrator` for production traffic
- Keep `[DEV]` and `[STAGING]` orchestrators inactive unless actively testing
- Use ClickUp webhook pointing to production orchestrator only

**Or use separate webhooks:**
- DEV webhook: `https://instance.app.n8n.cloud/webhook/dev-clickup-reply-setup`
- STAGING webhook: `https://instance.app.n8n.cloud/webhook/staging-clickup-reply-setup`
- PROD webhook: `https://instance.app.n8n.cloud/webhook/clickup-reply-setup`

## Benefits

✅ **Single n8n Cloud subscription** - One instance for all environments  
✅ **Clear separation** - Prefix makes it obvious which environment  
✅ **Safe testing** - Dev/staging can't affect production data  
✅ **Easy promotion** - Git merge = automatic deployment  
✅ **Audit trail** - All deployments tracked in GitHub Actions  
✅ **Rollback** - Revert commit and redeploy  

## Cost

**n8n Cloud:** One instance (~$50-200/month depending on plan)  
**ClickUp:** Need separate workspaces for dev/staging/prod  
**Reply.io:** Can use same account with different workspaces
