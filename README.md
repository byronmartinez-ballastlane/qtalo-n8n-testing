# Reply.io + ClickUp Automation

Automates Reply.io workspace provisioning using ClickUp as configuration source.

## Quick Start

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Get ClickUp workspace IDs:**
   ```bash
   ./scripts/get-clickup-ids.sh YOUR_CLICKUP_API_KEY
   ```

3. **Start services:**
   ```bash
   ./docker-manage.sh start
   ```

4. **Deploy workflows:**
   ```bash
   npm install
   npm run deploy
   ```

5. **Activate:**
   - Open http://localhost:5678
   - Login (credentials from `.env`)
   - Activate "Main Orchestrator" workflow

## How It Works

Three phases run when ClickUp task status → "Reply Setup":

1. **Import & Hygiene** - Create workspace, import mailboxes, normalize names
2. **Signatures & Opt-Outs** - Apply signatures + randomized opt-out lines  
3. **Standardize** - Set stages, fields, sequences, team members

Config comes from ClickUp custom fields + CSV attachment.

## Multi-Environment Setup

Deploy to dev/staging/production using GitHub Actions:

- **`dev` branch** → Auto-deploys as `[DEV]` workflows
- **`staging` branch** → Auto-deploys as `[STAGING]` workflows  
- **`main` branch** → Auto-deploys as `[PROD]` workflows

All in one n8n Cloud instance. See [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md) for setup.

## Development

```bash
# Debug mode
DEBUG=true npm run deploy

# View logs
./docker-manage.sh logs n8n

# Run tests
npm test
```

## Services

- n8n (5678) - Workflow engine
- postgres - Database
- redis - Cache
- clickup-mock (3001) - Test API
- replyio-mock (3002) - Test API

## Production Deployment

### n8n Cloud (Recommended)

See [N8N_CLOUD.md](N8N_CLOUD.md) for complete guide.

**Quick start:**
1. Sign up: https://app.n8n.cloud
2. Get API key from Settings → API
3. Update `.env`:
   ```bash
   N8N_API_URL=https://your-instance.app.n8n.cloud/api/v1
   N8N_API_KEY=n8n_api_xxxxx
   CLICKUP_API_URL=https://api.clickup.com/api/v2
   REPLY_API_URL=https://api.reply.io/v1
   ```
4. Run: `npm run deploy`
5. Activate workflow in n8n Cloud UI

### Self-Hosted

See [PRODUCTION.md](PRODUCTION.md) for self-hosting guide.
