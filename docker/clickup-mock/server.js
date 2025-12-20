const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;
const MOCK_DELAY = parseInt(process.env.MOCK_DELAY_MS || '100');

app.use(bodyParser.json());

// In-memory storage
const tasks = new Map();
const webhooks = new Map();
let taskIdCounter = 1;
let webhookIdCounter = 1;

// Middleware: Add delay to simulate network latency
app.use((req, res, next) => {
  setTimeout(next, MOCK_DELAY);
});

// Middleware: Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'clickup-mock', timestamp: new Date().toISOString() });
});

// Get task
app.get('/api/v2/task/:task_id', (req, res) => {
  const task = tasks.get(req.params.task_id);
  
  if (!task) {
    return res.status(404).json({ err: 'Task not found', ECODE: 'TASK_NOT_FOUND' });
  }
  
  res.json(task);
});

// Create task
app.post('/api/v2/list/:list_id/task', (req, res) => {
  const taskId = `task_${taskIdCounter++}`;
  
  const task = {
    id: taskId,
    name: req.body.name || 'Untitled Task',
    description: req.body.description || '',
    status: {
      status: req.body.status || 'Open',
      type: 'open'
    },
    custom_fields: (req.body.custom_fields || []).map(cf => ({
      id: `cf_${Math.random().toString(36).substr(2, 9)}`,
      name: cf.name,
      value: cf.value
    })),
    attachments: [],
    list: {
      id: req.params.list_id
    },
    date_created: Date.now().toString(),
    date_updated: Date.now().toString()
  };
  
  tasks.set(taskId, task);
  
  res.status(200).json(task);
});

// Update task
app.put('/api/v2/task/:task_id', (req, res) => {
  const task = tasks.get(req.params.task_id);
  
  if (!task) {
    return res.status(404).json({ err: 'Task not found' });
  }
  
  // Update fields
  if (req.body.name) task.name = req.body.name;
  if (req.body.description) task.description = req.body.description;
  if (req.body.status) {
    task.status.status = req.body.status;
    
    // Trigger webhook if status changed to "Reply Setup"
    if (req.body.status === 'Reply Setup') {
      triggerWebhooks('taskStatusUpdated', task);
    }
  }
  
  task.date_updated = Date.now().toString();
  
  res.json(task);
});

// Add custom field
app.post('/api/v2/list/:list_id/field', (req, res) => {
  const field = {
    id: `cf_${Math.random().toString(36).substr(2, 9)}`,
    name: req.body.name,
    type: req.body.type || 'text',
    type_config: req.body.type_config || {}
  };
  
  res.json(field);
});

// Post comment
app.post('/api/v2/task/:task_id/comment', (req, res) => {
  const comment = {
    id: `comment_${Math.random().toString(36).substr(2, 9)}`,
    comment_text: req.body.comment_text,
    date: Date.now()
  };
  
  res.json(comment);
});

// Upload attachment
app.post('/api/v2/task/:task_id/attachment', (req, res) => {
  const task = tasks.get(req.params.task_id);
  
  if (!task) {
    return res.status(404).json({ err: 'Task not found' });
  }
  
  const attachment = {
    id: `attachment_${Math.random().toString(36).substr(2, 9)}`,
    title: req.body.filename || 'file.txt',
    url: `http://clickup-mock:3001/attachments/${Math.random().toString(36).substr(2, 9)}`,
    date: Date.now()
  };
  
  task.attachments = task.attachments || [];
  task.attachments.push(attachment);
  
  res.json(attachment);
});

// Get attachment (mock CSV download)
app.get('/attachments/:attachment_id', (req, res) => {
  const mockCsv = `Email,Sender Name,Daily Limit,SMTP Host,SMTP Port,SMTP Password,IMAP Host,IMAP Port,IMAP Password,Warmup Daily Goal,Warmup Daily Increment
test1@example.com,Test User 1,50,smtp.gmail.com,587,password123,imap.gmail.com,993,password123,20,2
test2@example.com,Test User 2,40,smtp.gmail.com,587,password456,imap.gmail.com,993,password456,15,2`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.send(mockCsv);
});

// Create webhook
app.post('/api/v2/webhook', (req, res) => {
  const webhookId = `webhook_${webhookIdCounter++}`;
  
  const webhook = {
    id: webhookId,
    webhook: {
      endpoint: req.body.endpoint,
      events: req.body.events || []
    }
  };
  
  webhooks.set(webhookId, webhook);
  
  console.log(`Webhook created: ${req.body.endpoint}`);
  
  res.json(webhook);
});

// Helper: Trigger webhooks
function triggerWebhooks(event, data) {
  webhooks.forEach(webhook => {
    if (webhook.webhook.events.includes(event)) {
      console.log(`Triggering webhook: ${webhook.webhook.endpoint}`);
      
      // In real scenario, you would POST to the endpoint
      // For mock, we just log it
    }
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ err: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ClickUp Mock Server running on port ${PORT}`);
  console.log(`Mock delay: ${MOCK_DELAY}ms`);
});
