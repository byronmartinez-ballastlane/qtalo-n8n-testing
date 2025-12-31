# Gap Analysis: Spec vs Current Implementation

## Summary

| Feature | Spec Requirement | Implementation Status | Notes |
|---------|-----------------|----------------------|-------|
| **Phase 1** | | | |
| Workspace create if missing | ✅ Required | ❌ NOT POSSIBLE | Reply.io API doesn't support workspace creation |
| Mailbox upsert | ✅ Required | ✅ Implemented | Create/update by email |
| Display name normalization | ✅ Required | ✅ Implemented | First-name-only format |
| Sending limits/windows | ✅ Optional | ✅ Implemented | Daily limit via API, sending windows via Reply.io Schedules API |
| CSV report attachment | ✅ Required | ✅ Implemented | Attached to ClickUp |
| ClickUp summary comment | ✅ Required | ✅ Implemented | |
| **Phase 2** | | | |
| Signature template rendering | ✅ Required | ✅ Implemented | {{first_name}}, {{company_name}}, etc. |
| Random opt-out line | ✅ Required | ✅ Implemented | Picks from opt_out_variants |
| Apply signature to Reply.io | ✅ Required | ❌ NOT POSSIBLE | Reply.io API doesn't support setting signatures |
| force_overwrite respect | ✅ Required | ✅ Implemented | Skips if has signature & !force |
| CSV report attachment | ✅ Required | ✅ Implemented | |
| **Phase 3** | | | |
| Stages upsert | ✅ Required | ❌ NOT IMPLEMENTED | stages_spec extracted but never used |
| Custom fields upsert | ✅ Required | ✅ Implemented | Auto-adds "Lead Stage" field |
| Sequence template clone | ✅ Required | ✅ Implemented | Clones from source IDs |
| Team invites | ✅ Required | ❌ NOT POSSIBLE | Reply.io API doesn't support user invites |
| CSV reports | ✅ Required | ⚠️ Partial | Only custom fields CSV |

---

## Detailed Gap Analysis

### 1. ❌ Phase 1: Workspace Creation (NOT POSSIBLE)

**Spec Says:**
> Workspace: Create if missing; save ID back to ClickUp.

**Reality:**
Reply.io API does **NOT** support workspace creation. Workspaces can only be created through the Reply.io web UI.

**Current Behavior:**
- Workflow assumes workspace already exists
- API key is scoped to a specific workspace automatically

**Recommendation:**
- Document this as a pre-requisite
- Add validation that workspace exists (GET /v1/accounts returns workspace info)
- Update ClickUp comment to note workspace must be pre-created

---

### 2. ✅ Phase 1: Sending Windows (IMPLEMENTED)

**Spec Says:**
> sending_limits JSON (e.g., { "daily": 30, "window": { "start": "09:00", "end": "17:00", "tz": "America/New_York" } })

**Reality:**
Reply.io API supports:
- ✅ Daily limit (`dailyLimit`) via mailbox settings
- ✅ Sending windows via Reply.io Schedules API (`POST /v2/schedules`)

**Current Behavior:**
- Daily limit is passed to mailbox creation
- Sending windows are configured via `sending_schedule` ClickUp field
- Phase 1 creates a Reply.io Schedule with the configured time windows
- Schedule is set as default for new sequences/campaigns

**ClickUp Field Format (`sending_schedule`):**
```json
{
  "name": "Business Hours",
  "timezone": "Eastern Standard Time",
  "window": { "start": "09:00", "end": "17:00" },
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "set_as_default": true
}
```

---

### 3. ❌ Phase 2: Apply Signatures to Reply.io (NOT POSSIBLE)

**Spec Says:**
> Apply to Reply: If signature & opt-out exist and force_overwrite = false → skip, Else → write both fields

**Reality:**
Reply.io API does **NOT** support setting email signatures. Signatures can only be configured through the Reply.io web UI.

**Current Behavior:**
- Signatures are **generated and reported** but NOT applied
- CSV report includes the generated signature for manual setup
- Comment states "Signature generated (manual setup required in Reply.io UI)"

**Recommendation:**
- Generate copy-paste ready signatures in report
- Consider adding a dedicated "Signatures" Google Sheet output for easy bulk copy
- Update spec to reflect this is a "generate for manual apply" flow

---

### 4. ❌ Phase 3: Stages Upsert (NOT IMPLEMENTED)

**Spec Says:**
> Stages: Upsert in order (don't delete unknown unless force_overwrite = true and a "hard reset" is desired)

**Reality:**
- `stages_spec` is extracted from ClickUp custom fields
- `stages_spec` is passed to Phase 3
- **But Phase 3 does NOTHING with it!**

**Current Behavior:**
Phase 3 only handles:
1. Custom Fields
2. Sequences

Stages are completely ignored.

**Reply.io API Support:**
- Need to verify if Reply.io has "stages" concept
- May be called "Contact Status" or similar
- May not exist at all in Reply.io

**Recommendation:**
- Investigate Reply.io API for equivalent feature
- If exists: implement stages upsert
- If not: remove from spec OR map to different feature

---

### 5. ❌ Phase 3: Team Invites (NOT POSSIBLE)

**Spec Says:**
> Team Invites: Invite or verify; update roles only if overwrite is forced

**Reality:**
Reply.io API does **NOT** support team/user management. User invites can only be done through the Reply.io web UI.

**Current Behavior:**
- `reply_user_invites` is extracted from ClickUp
- But Phase 3 does NOT process it at all

**Recommendation:**
- Remove from spec OR
- Add to ClickUp comment as "Manual steps required" with the user list

---

### 6. ⚠️ Phase 3: CSV Reports (PARTIAL)

**Spec Says:**
> Optional CSV reports: stages,status | fields,status | template_id,status | user_email,status

**Reality:**
Only custom fields CSV is generated. Missing:
- Stages CSV (not implemented)
- Sequences CSV ✅ (implemented)
- Users CSV (not possible)

---

## Implementation Priority

### High Priority (Should Fix)
1. **Stages** - Either implement if API supports, or remove from spec
2. **Better documentation** - Make API limitations clear in ClickUp comments

### Medium Priority (Nice to Have)
3. **Phase 2 signature export** - Generate a better format for manual copy-paste
4. **Team invites note** - Add to final comment with list of users to invite manually

### Low Priority (Accept as Is)
5. **Workspace creation** - Document as pre-requisite
6. **Sending windows** - Document as UI-only

---

## What IS Working Well ✅

1. **Multi-tenancy isolation** - expected_domains filtering
2. **Mailbox upsert flow** - create/update with retry logic
3. **Signature generation** - template rendering with variables
4. **Custom fields** - upsert with "Lead Stage" auto-add
5. **Sequence cloning** - from template IDs
6. **CSV reports** - attached to ClickUp tasks
7. **ClickUp comments** - detailed summaries after each phase
8. **Error handling** - auth errors posted to ClickUp
9. **force_overwrite** - respected throughout

---

## Reply.io API Limitations Summary

| Feature | API Support |
|---------|------------|
| Workspaces | ❌ UI Only |
| Email Accounts/Mailboxes | ✅ Full CRUD |
| Mailbox Settings (daily limit) | ✅ |
| Sending Schedules (time windows) | ✅ Create, List, Set Default |
| Email Signatures | ❌ UI Only (Puppeteer Lambda) |
| Custom Fields | ✅ Full CRUD |
| Campaigns/Sequences | ✅ Full CRUD |
| Team/Users | ❌ UI Only |
| Contacts | ✅ Full CRUD |

---

## Action Items

- [ ] Verify Reply.io "stages" API (may be contact statuses)
- [ ] Add manual steps to final ClickUp comment for UI-only features
- [ ] Update CLICKUP_SETUP_GUIDE.md with API limitations
- [ ] Consider adding a "Pre-Flight Checklist" to validate setup before run
