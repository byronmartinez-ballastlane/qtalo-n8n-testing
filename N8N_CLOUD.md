# n8n Cloud Deployment Guide

## Quick Setup (5 minutes)

### 1. Create n8n Cloud Instance

1. Go to https://app.n8n.cloud/register
2. Sign up for account
3. Choose plan:
   - **Starter ($20/mo):** 2,500 executions/month
   - **Pro ($50/mo):** 10,000 executions/month
   - **Enterprise:** Custom pricing
4. Your instance URL: `https://YOUR_INSTANCE.app.n8n.cloud`

### 2. Get API Key

1. Login to your n8n Cloud instance
2. Click your profile → **Settings**
3. Go to **API** tab
4. Click **Create API Key**
5. Copy the key (format: `n8n_api_xxxxxxxxxxxxx`)

### 3. Configure Environment

Update your local `.env`:

```bash
# n8n Cloud Configuration
N8N_API_URL=https://YOUR_INSTANCE.app.n8n.cloud/api/v1
N8N_API_KEY=n8n_api_xxxxxxxxxxxxx

# Production APIs (NOT mocks!)
CLICKUP_API_URL=https://api.clickup.com/api/v2
REPLY_API_URL=https://api.reply.io/v1

# Your Real API Keys
CLICKUP_API_KEY=pk_YOUR_REAL_CLICKUP_KEY
REPLY_API_KEY=YOUR_REAL_REPLY_KEY

# ClickUp Workspace IDs
CLICKUP_TEAM_ID=your_team_id
CLICKUP_SPACE_ID=your_space_id
CLICKUP_FOLDER_ID=your_folder_id
CLICKUP_LIST_ID=your_list_id
```

### 4. Deploy Workflows

From your local machine:

```bash
npm run deploy
```

**Output:**
```
✅ Connected to n8n Cloud
✅ Created: ClickUp API credential
✅ Created: Reply.io API credential
✅ Updated: Phase 1 workflow
✅ Updated: Phase 2 workflow
✅ Updated: Phase 3 workflow
✅ Updated: Main Orchestrator workflow
```

### 5. Activate Workflow

1. Open `https://YOUR_INSTANCE.app.n8n.cloud`
2. Go to **Workflows**
3. Open **Main Orchestrator**
4. Click **Active** toggle (top right)
5. Copy webhook URL (will be: `https://YOUR_INSTANCE.app.n8n.cloud/webhook/clickup-reply-setup`)

### 6. Configure ClickUp Webhook

1. Go to ClickUp workspace
2. Settings → Integrations → Webhooks
3. Create new webhook:
   - **Endpoint:** `https://YOUR_INSTANCE.app.n8n.cloud/webhook/clickup-reply-setup`
   - **Events:** Task Status Updated
   - **Filters:** Status changes to "Reply Setup"

### 7. Test It!

1. Create a ClickUp task in your configured list
2. Add custom fields:
   - `company_name`: Test Company
   - `company_url`: www.test.com
   - `reply_workspace_id`: (leave empty, will auto-create)
3. Attach CSV with mailboxes
4. Change status to **"Reply Setup"**

Watch execution in n8n Cloud:
- Workflows → Main Orchestrator → Executions tab
- Should see green checkmarks for all 3 phases

## What You DON'T Need

With n8n Cloud, you don't need:
- ❌ Docker Compose (workflows run in cloud)
- ❌ PostgreSQL setup (managed by n8n)
- ❌ Redis setup (managed by n8n)
- ❌ Server/VPS (fully managed)
- ❌ SSL certificates (included)
- ❌ Monitoring setup (built-in)
- ❌ Backup configuration (automatic)

## What You Still Use Locally

✅ `npm run deploy` - Deploy/update workflows from your machine
✅ Workflow JSON files - Edit locally, deploy to cloud
✅ `scripts/get-clickup-ids.sh` - Get workspace IDs
✅ Git repo - Version control your workflows

## Local Development

You can still test locally with Docker Compose:

```bash
# Start local n8n with mocks
docker-compose up -d

# Deploy to local (for testing)
N8N_API_URL=http://localhost:5678/api/v1 npm run deploy

# When ready, deploy to cloud
N8N_API_URL=https://YOUR_INSTANCE.app.n8n.cloud/api/v1 npm run deploy
```

## Credentials Management

The deployment script automatically creates credentials in n8n Cloud:

**ClickUp API:**
- Type: `clickUpApi`
- Uses: `CLICKUP_API_KEY` from `.env`

**Reply.io API:**
- Type: `httpHeaderAuth`
- Header: `X-API-KEY`
- Uses: `REPLY_API_KEY` from `.env`

All workflow nodes are automatically linked to these credentials.

## Updating Workflows

When you make changes locally:

```bash
# Edit workflow JSON files
vim workflows/phase1-import-hygiene.json

# Deploy changes to cloud
npm run deploy
```

Workflows update instantly—no downtime.

## Monitoring

**In n8n Cloud dashboard:**

1. **Executions:** See all workflow runs
   - Success/failure status
   - Execution time
   - Input/output data
   - Error messages

2. **Activity:** Recent changes
   - Workflow activations
   - Credential updates
   - API usage

3. **Settings → Usage:** Monitor limits
   - Executions used this month
   - Webhook calls
   - Active workflows

## Troubleshooting

### Issue: Webhook not triggering

**Check:**
1. Workflow is **Active** (green toggle)
2. ClickUp webhook endpoint is correct
3. ClickUp webhook events include "Task Status Updated"
4. Test webhook manually in ClickUp

### Issue: Credentials not working

**Check:**
1. API keys are correct in `.env`
2. Re-run `npm run deploy` to update credentials
3. In n8n Cloud, go to Credentials → verify keys are set

### Issue: ClickUp node validation errors

**Expected!** These show before execution:
- "Task ID required" → Filled at runtime from webhook
- "Team/Space/List ID" → Check your `.env` has correct IDs

Run `./scripts/get-clickup-ids.sh` to get IDs.

## Cost Estimate

**n8n Cloud Starter ($20/mo):**
- 2,500 workflow executions
- Unlimited workflows
- SSL/HTTPS included
- Automatic backups
- 99.9% uptime

**Example usage:**
- 10 Reply.io setups per day = ~300 executions/month
- Well within Starter plan limits

**Scale up:**
- Pro plan ($50/mo) = 10,000 executions
- Enterprise = unlimited + SSO + SLA

## Production Checklist

Before going live:

- [ ] n8n Cloud instance created
- [ ] API keys added to `.env` (real, not mock)
- [ ] ClickUp workspace IDs configured
- [ ] `npm run deploy` completed successfully
- [ ] Main Orchestrator activated
- [ ] ClickUp webhook configured and tested
- [ ] Test execution completed successfully
- [ ] Monitored execution logs in n8n Cloud
- [ ] Team members invited (if needed)

## Benefits of n8n Cloud

**vs Self-hosted:**

| Feature | n8n Cloud | Self-hosted |
|---------|-----------|-------------|
| Setup time | 5 min | 2-4 hours |
| Infrastructure | Managed | You manage |
| SSL/HTTPS | Included | Configure |
| Backups | Automatic | Setup required |
| Updates | Automatic | Manual |
| Monitoring | Built-in | Setup required |
| Uptime SLA | 99.9% | Your responsibility |
| Cost | $20-50/mo | $50-100/mo + time |

**Recommendation:** Use n8n Cloud unless you have specific compliance requirements for self-hosting.

## Support

**n8n Cloud:**
- Documentation: https://docs.n8n.io/hosting/cloud/
- Support: support@n8n.io
- Community: https://community.n8n.io

**This Project:**
- Check workflow executions in n8n Cloud UI
- Review execution logs for errors
- Verify ClickUp custom fields are populated
- Test with mock data first
