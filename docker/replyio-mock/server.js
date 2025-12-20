const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3002;
const MOCK_DELAY = parseInt(process.env.MOCK_DELAY_MS || '100');

app.use(bodyParser.json());

// In-memory storage
const workspaces = new Map();
const mailboxes = new Map();
const signatures = new Map();
const stages = new Map();
const customFields = new Map();
const sequences = new Map();

let workspaceIdCounter = 1;
let mailboxIdCounter = 1;
let stageIdCounter = 1;
let fieldIdCounter = 1;

// Middleware: Add delay
app.use((req, res, next) => {
  setTimeout(next, MOCK_DELAY);
});

// Middleware: Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'replyio-mock', timestamp: new Date().toISOString() });
});

// ============================================================================
// Workspaces
// ============================================================================

app.get('/v1/workspaces', (req, res) => {
  res.json({ workspaces: Array.from(workspaces.values()) });
});

app.get('/v1/workspaces/:workspace_id', (req, res) => {
  const workspace = workspaces.get(req.params.workspace_id);
  
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  
  res.json(workspace);
});

app.post('/v1/workspaces', (req, res) => {
  const workspaceId = `ws_${workspaceIdCounter++}`;
  
  const workspace = {
    id: workspaceId,
    name: req.body.name || 'Untitled Workspace',
    timezone: req.body.timezone || 'America/New_York',
    created_at: new Date().toISOString()
  };
  
  workspaces.set(workspaceId, workspace);
  
  console.log(`Workspace created: ${workspace.name} (${workspaceId})`);
  
  res.status(201).json(workspace);
});

// ============================================================================
// Mailboxes
// ============================================================================

app.get('/v1/mailboxes', (req, res) => {
  let results = Array.from(mailboxes.values());
  
  // Filter by workspace_id
  if (req.query.workspace_id) {
    results = results.filter(m => m.workspace_id === req.query.workspace_id);
  }
  
  // Filter by email
  if (req.query.email) {
    results = results.filter(m => m.email === req.query.email);
  }
  
  res.json({ mailboxes: results });
});

app.get('/v1/mailboxes/:mailbox_id', (req, res) => {
  const mailbox = mailboxes.get(req.params.mailbox_id);
  
  if (!mailbox) {
    return res.status(404).json({ error: 'Mailbox not found' });
  }
  
  res.json(mailbox);
});

app.post('/v1/mailboxes', (req, res) => {
  // Check if mailbox already exists
  const existing = Array.from(mailboxes.values()).find(
    m => m.email === req.body.email && m.workspace_id === req.body.workspace_id
  );
  
  if (existing) {
    // Update existing
    Object.assign(existing, req.body);
    existing.updated_at = new Date().toISOString();
    
    console.log(`Mailbox updated: ${existing.email}`);
    
    return res.json(existing);
  }
  
  // Create new
  const mailboxId = `mb_${mailboxIdCounter++}`;
  
  const mailbox = {
    id: mailboxId,
    workspace_id: req.body.workspace_id,
    email: req.body.email,
    display_name: req.body.display_name || req.body.email.split('@')[0],
    daily_limit: req.body.daily_limit || 50,
    smtp_host: req.body.smtp_host,
    smtp_port: req.body.smtp_port || 587,
    smtp_username: req.body.email,
    imap_host: req.body.imap_host,
    imap_port: req.body.imap_port || 993,
    imap_username: req.body.email,
    warmup_enabled: req.body.warmup_enabled !== false,
    warmup_daily_goal: req.body.warmup_daily_goal || 20,
    warmup_daily_increment: req.body.warmup_daily_increment || 2,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  mailboxes.set(mailboxId, mailbox);
  
  console.log(`Mailbox created: ${mailbox.email} (${mailboxId})`);
  
  res.status(201).json(mailbox);
});

app.put('/v1/mailboxes/:mailbox_id', (req, res) => {
  const mailbox = mailboxes.get(req.params.mailbox_id);
  
  if (!mailbox) {
    return res.status(404).json({ error: 'Mailbox not found' });
  }
  
  Object.assign(mailbox, req.body);
  mailbox.updated_at = new Date().toISOString();
  
  console.log(`Mailbox updated: ${mailbox.email}`);
  
  res.json(mailbox);
});

// ============================================================================
// Signatures
// ============================================================================

app.get('/v1/mailboxes/:mailbox_id/signature', (req, res) => {
  const signature = signatures.get(req.params.mailbox_id);
  
  if (!signature) {
    return res.status(404).json({ error: 'Signature not found' });
  }
  
  res.json(signature);
});

app.put('/v1/mailboxes/:mailbox_id/signature', (req, res) => {
  const mailbox = mailboxes.get(req.params.mailbox_id);
  
  if (!mailbox) {
    return res.status(404).json({ error: 'Mailbox not found' });
  }
  
  const signature = {
    mailbox_id: req.params.mailbox_id,
    signature: req.body.signature,
    updated_at: new Date().toISOString()
  };
  
  signatures.set(req.params.mailbox_id, signature);
  
  console.log(`Signature set for mailbox: ${mailbox.email}`);
  
  res.json(signature);
});

// ============================================================================
// Opt-Out Lines
// ============================================================================

app.put('/v1/mailboxes/:mailbox_id/opt-out', (req, res) => {
  const mailbox = mailboxes.get(req.params.mailbox_id);
  
  if (!mailbox) {
    return res.status(404).json({ error: 'Mailbox not found' });
  }
  
  mailbox.opt_out_line = req.body.opt_out_line;
  mailbox.updated_at = new Date().toISOString();
  
  console.log(`Opt-out line set for mailbox: ${mailbox.email}`);
  
  res.json({ opt_out_line: mailbox.opt_out_line });
});

// ============================================================================
// Stages
// ============================================================================

app.get('/v1/workspaces/:workspace_id/stages', (req, res) => {
  const workspaceStages = Array.from(stages.values())
    .filter(s => s.workspace_id === req.params.workspace_id);
  
  res.json({ stages: workspaceStages });
});

app.post('/v1/stages', (req, res) => {
  const stageId = `stage_${stageIdCounter++}`;
  
  const stage = {
    id: stageId,
    workspace_id: req.body.workspace_id,
    name: req.body.name,
    order: req.body.order || 0,
    created_at: new Date().toISOString()
  };
  
  stages.set(stageId, stage);
  
  console.log(`Stage created: ${stage.name} (${stageId})`);
  
  res.status(201).json(stage);
});

// ============================================================================
// Custom Fields
// ============================================================================

app.get('/v1/workspaces/:workspace_id/custom-fields', (req, res) => {
  const workspaceFields = Array.from(customFields.values())
    .filter(f => f.workspace_id === req.params.workspace_id);
  
  res.json({ custom_fields: workspaceFields });
});

app.post('/v1/custom-fields', (req, res) => {
  const fieldId = `field_${fieldIdCounter++}`;
  
  const field = {
    id: fieldId,
    workspace_id: req.body.workspace_id,
    name: req.body.name,
    type: req.body.type || 'text',
    created_at: new Date().toISOString()
  };
  
  customFields.set(fieldId, field);
  
  console.log(`Custom field created: ${field.name} (${fieldId})`);
  
  res.status(201).json(field);
});

// ============================================================================
// Team Invites
// ============================================================================

app.post('/v1/workspaces/:workspace_id/invites', (req, res) => {
  const invite = {
    id: `invite_${Math.random().toString(36).substr(2, 9)}`,
    workspace_id: req.params.workspace_id,
    email: req.body.email,
    role: req.body.role || 'member',
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  console.log(`Invite sent: ${invite.email} (${invite.role})`);
  
  res.status(201).json(invite);
});

// ============================================================================
// Sequences
// ============================================================================

app.post('/v1/sequences/:sequence_id/link', (req, res) => {
  const link = {
    sequence_id: req.params.sequence_id,
    workspace_id: req.body.workspace_id,
    linked_at: new Date().toISOString()
  };
  
  console.log(`Sequence linked: ${req.params.sequence_id}`);
  
  res.json(link);
});

// ============================================================================
// Rate Limiting Simulation
// ============================================================================

let requestCount = 0;
let resetTime = Date.now() + 60000; // Reset every minute

app.use((req, res, next) => {
  if (Date.now() > resetTime) {
    requestCount = 0;
    resetTime = Date.now() + 60000;
  }
  
  requestCount++;
  
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', Math.max(0, 100 - requestCount));
  res.setHeader('X-RateLimit-Reset', Math.floor(resetTime / 1000));
  
  if (requestCount > 100) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retry_after: Math.ceil((resetTime - Date.now()) / 1000)
    });
  }
  
  next();
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Reply.io Mock Server running on port ${PORT}`);
  console.log(`Mock delay: ${MOCK_DELAY}ms`);
});
