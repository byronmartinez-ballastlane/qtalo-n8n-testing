# ClickUp Task Setup - Step by Step Guide

## TASK: Reply.io Setup (Task ID: 86acb0atg)

### Step 1: Open the Task
1. Go to ClickUp
2. Navigate to: Client Alpha → Outreach list
3. Click on "Reply.io Setup" task

### Step 2: Add CSV Attachment
1. Click the attachment icon or drag-and-drop
2. Upload the file: `sample-mailboxes.csv` (from your qtalo-n8n folder)
3. Wait for upload to complete

### Step 3: Set Custom Fields (Required)
Click "Add custom field" and add these:

**Required Fields:**
- `company_name` (Text) = "Career Angel"
- `company_url` (Text) = "www.careerangel.ai"
- `force_overwrite` (Checkbox) = Unchecked (false)

**Optional Fields (for testing):**
- `signature_template_plain` (Text) = "{{first_name}} @ {{company_name}}"
- `opt_out_variants` (Text, multiline) = 
  ```
  If you're ready to move on from my emails, just reply.
  Not interested? Let me know.
  Reply to unsubscribe.
  ```

### Step 4: Trigger the Workflow
**Option A - Change Status (Recommended):**
1. Click on the status dropdown (currently "NOT STARTED")
2. Change it to "IN PROGRESS"
3. This will trigger the webhook automatically

**Option B - Manual Trigger (Testing):**
Run this command in terminal:
```bash
curl -X POST "http://localhost:5678/webhook/clickup-reply-setup" \
  -H "Content-Type: application/json" \
  -d '{"event":"taskUpdated","task_id":"86acb0atg"}'
```

### Step 5: Wait for Execution (8-10 seconds)
The workflow will:
1. ✅ Fetch task details from ClickUp
2. ✅ Download CSV attachment
3. ✅ Run Phase 1: Create email accounts in Reply.io
4. ✅ Run Phase 2: Generate signature reports (not applied via API)
5. ✅ Run Phase 3: Workspace standardization
6. ✅ Post results back to ClickUp as comments

### Step 6: Check Results

**A. In ClickUp:**
- Check task comments for execution summaries
- Look for CSV report attachments (if implemented)

**B. In Reply.io:**
1. Log in to https://reply.io
2. Go to Settings → Email Accounts
3. Verify that email account from CSV was created/updated
4. Note: Signatures will NOT be applied (must be done manually)

**C. In n8n:**
1. Open http://localhost:5678/workflows
2. Click "Qtalo - Main Orchestrator"
3. Check execution history (should show green checkmarks)

### Step 7: Verify with Analysis Script
Run in terminal:
```bash
cd /Users/byronmartinez/Desktop/qtalo-n8n
./scripts/test-end-to-end.sh
```

This will show you:
- ✅ All workflow executions
- ✅ What was sent to Reply.io
- ✅ Current state of email accounts
- ✅ Full execution analysis

---

## Expected Results:

### Phase 1 Output:
```
Reply Import + Hygiene complete.
Mailboxes: 1 processed (1 created/updated, 0 skipped)
Report attached: reply_setup_phase1.csv
```

### Phase 2 Output:
```
Signatures generated (manual setup required).
1 mailbox processed: 1 signature generated
Note: Signatures must be set manually in Reply.io UI
Report attached: reply_setup_phase2.csv
```

### Phase 3 Output:
```
Workspace Standardized.
Stages: 6 processed
Custom Fields: 0 processed
Team Invites: 0 processed
```

---

## Troubleshooting:

**If webhook doesn't trigger:**
- Make sure Main Orchestrator is ACTIVE in n8n
- Verify webhook URL: http://localhost:5678/webhook/clickup-reply-setup
- Use manual curl command to test

**If Reply.io shows no email accounts:**
- Check Phase 1 execution logs
- Verify Reply.io API key is correct
- Check sample-mailboxes.csv has valid data

**If ClickUp shows no comments:**
- Check ClickUp API token is valid
- Verify task ID is correct (86acb0atg)
- Check n8n execution logs for ClickUp API errors
