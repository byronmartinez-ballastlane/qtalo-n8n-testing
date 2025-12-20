# Reply.io API Limitations

## Workspace Management

**Important**: Reply.io workspaces CANNOT be created or managed via API.

### What This Means

1. **Workspaces are UI-only**: Reply.io workspaces must be created manually in the Reply.io web interface under "Workspace Settings"

2. **API Key Scope**: Each Reply.io API key is scoped to a specific workspace - it automatically operates within that workspace's context

3. **No Workspace Endpoints**: The Reply.io API does NOT support:
   - `POST /workspaces` (create workspace)
   - `PUT /workspaces/{id}` (update workspace)
   - `GET /workspaces/{id}` (get specific workspace)

### How Our Workflow Handles This

**Phase 1: Import & Hygiene**
- ✅ **Skips workspace creation** - assumes workspace already exists
- ✅ **Uses API key's default workspace** - all mailbox operations automatically target the workspace tied to the API key
- ✅ **Mailbox operations work** - `GET /mailboxes` and `POST /mailboxes` are fully supported

**Required Pre-Setup**
1. Create Reply.io workspace manually in the UI
2. Generate API key from that workspace
3. Add API key to `.env` file: `REPLY_API_KEY=your_key_here`

### What Reply.io API Supports

✅ **Mailboxes**: Full CRUD operations
✅ **Campaigns**: Create, manage, track
✅ **Contacts**: Add, update, remove
✅ **Email Sending**: Send emails via API
✅ **Analytics**: Campaign performance data

❌ **Workspaces**: No API support
❌ **Team Management**: UI-only
❌ **User Invites**: UI-only
❌ **Account Settings**: UI-only

### Sources

- Reply.io API Documentation: https://apidocs.reply.io/
- Reply.io focuses on sales engagement (campaigns, contacts, emails)
- Workspace/team management handled through web interface
