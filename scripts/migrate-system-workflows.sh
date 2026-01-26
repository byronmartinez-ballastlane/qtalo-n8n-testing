#!/bin/sh
# =============================================================================
# Migrate System Workflows to Qtalo AWS Account
# =============================================================================
# This script:
# 1. Downloads the 3 system workflows from n8n
# 2. Creates backups
# 3. Replaces old BLA AWS values with new Qtalo values
# 4. Deletes the workflows from n8n
# 5. Re-uploads the updated workflows (cleaned for n8n API)
# =============================================================================

set -e

# Configuration
N8N_API_URL="https://qtalospace.app.n8n.cloud/api/v1"
N8N_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjZkNTI3MC00YjI4LTQ0MmItYWJhZi01MjMwNGUwZTdlMGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2NDU3NjE0fQ.kUqry1F6XGZf-HEQyUYVBAqyPBbAGX42_u8EXi0YiJ8"

# Workflow IDs
WORKFLOW_IDS="tY5ftbB8sdeSz1bF yMRb0i13knCpzGnF aHhgGkrbTKvywIJk"

# Old values (BLA account)
OLD_REST_API_ID="zxn1hyal26"
OLD_HTTP_API_ID="oc05p6ctz7"
OLD_AWS_API_KEY="3fTQPitk0R8ZrD1lWt5gX7zAUqyuqwII2Gxf8Llj"

# New values (Qtalo account)
NEW_REST_API_ID="r81lwr2etg"
NEW_HTTP_API_ID="tvp0h6ee7g"
NEW_AWS_API_KEY="6kzMCd0d7Z4TgMemJ2NCT4UF3SmYVR0O2azPpuRv"

# Directories
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups/workflows-$(date +%Y%m%d-%H%M%S)"
TEMP_DIR="$PROJECT_DIR/temp-workflows"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1"
}

# Create directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$TEMP_DIR"

echo ""
echo "=============================================="
echo "  Migrate System Workflows to Qtalo AWS"
echo "=============================================="
echo ""
log_info "Backup directory: $BACKUP_DIR"
log_info "Temp directory: $TEMP_DIR"
echo ""

# =============================================================================
# Step 1: Download workflows
# =============================================================================
echo "=============================================="
echo "Step 1: Downloading workflows from n8n..."
echo "=============================================="

for WORKFLOW_ID in $WORKFLOW_IDS; do
    log_info "Downloading workflow: $WORKFLOW_ID"
    
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TEMP_DIR/$WORKFLOW_ID.json" \
        -X GET "$N8N_API_URL/workflows/$WORKFLOW_ID" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Accept: application/json")
    
    if [ "$HTTP_CODE" = "200" ]; then
        # Get workflow name from JSON using python for reliable parsing
        WORKFLOW_NAME=$(python3 -c "import json; print(json.load(open('$TEMP_DIR/$WORKFLOW_ID.json'))['name'])")
        log_success "Downloaded: $WORKFLOW_NAME ($WORKFLOW_ID)"
        
        # Create backup (original with all metadata)
        cp "$TEMP_DIR/$WORKFLOW_ID.json" "$BACKUP_DIR/$WORKFLOW_ID-original.json"
    else
        log_error "Failed to download workflow $WORKFLOW_ID (HTTP $HTTP_CODE)"
        cat "$TEMP_DIR/$WORKFLOW_ID.json"
        exit 1
    fi
done

echo ""
log_success "All workflows downloaded and backed up to: $BACKUP_DIR"
echo ""

# =============================================================================
# Step 2: Replace values and clean for n8n API
# =============================================================================
echo "=============================================="
echo "Step 2: Replacing AWS values and cleaning workflows..."
echo "=============================================="

for WORKFLOW_ID in $WORKFLOW_IDS; do
    log_info "Processing workflow: $WORKFLOW_ID"
    
    # Use Python to:
    # 1. Replace AWS values
    # 2. Strip metadata fields that n8n API doesn't accept
    python3 << EOF
import json

# Load workflow
with open('$TEMP_DIR/$WORKFLOW_ID.json', 'r') as f:
    wf = json.load(f)

# Convert to string for replacements
wf_str = json.dumps(wf)

# Count replacements
rest_count = wf_str.count('$OLD_REST_API_ID')
http_count = wf_str.count('$OLD_HTTP_API_ID')
key_count = wf_str.count('$OLD_AWS_API_KEY')

print(f"  - REST API ID replacements: {rest_count}")
print(f"  - HTTP API ID replacements: {http_count}")
print(f"  - AWS API Key replacements: {key_count}")

# Perform replacements
wf_str = wf_str.replace('$OLD_REST_API_ID', '$NEW_REST_API_ID')
wf_str = wf_str.replace('$OLD_HTTP_API_ID', '$NEW_HTTP_API_ID')
wf_str = wf_str.replace('$OLD_AWS_API_KEY', '$NEW_AWS_API_KEY')

# Parse back
wf = json.loads(wf_str)

# Keep only fields allowed by n8n POST /workflows API
clean_wf = {
    'name': wf.get('name'),
    'nodes': wf.get('nodes', []),
    'connections': wf.get('connections', {}),
    'settings': wf.get('settings', {}),
}

# Optional fields
if wf.get('staticData'):
    clean_wf['staticData'] = wf['staticData']
if wf.get('pinData'):
    clean_wf['pinData'] = wf['pinData']

# Save cleaned workflow
with open('$TEMP_DIR/$WORKFLOW_ID-clean.json', 'w') as f:
    json.dump(clean_wf, f)

print(f"  - Cleaned workflow saved")
EOF
done

echo ""
log_success "All workflows processed and cleaned"
echo ""

# =============================================================================
# Step 3: Delete workflows from n8n
# =============================================================================
echo "=============================================="
echo "Step 3: Deleting workflows from n8n..."
echo "=============================================="

for WORKFLOW_ID in $WORKFLOW_IDS; do
    log_info "Deleting workflow: $WORKFLOW_ID"
    
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
        -X DELETE "$N8N_API_URL/workflows/$WORKFLOW_ID" \
        -H "X-N8N-API-KEY: $N8N_API_KEY")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        log_success "Deleted workflow: $WORKFLOW_ID"
    else
        log_warning "Workflow $WORKFLOW_ID may already be deleted (HTTP $HTTP_CODE)"
    fi
done

echo ""
log_success "All workflows deleted from n8n"
echo ""

# =============================================================================
# Step 4: Re-upload updated workflows
# =============================================================================
echo "=============================================="
echo "Step 4: Re-uploading updated workflows..."
echo "=============================================="

NEW_WORKFLOW_IDS=""

for WORKFLOW_ID in $WORKFLOW_IDS; do
    log_info "Uploading workflow: $WORKFLOW_ID"
    
    # Use the cleaned workflow file
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST "$N8N_API_URL/workflows" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H "Content-Type: application/json" \
        -d @"$TEMP_DIR/$WORKFLOW_ID-clean.json")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        # Parse response with Python for reliability
        NEW_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
        WORKFLOW_NAME=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
        log_success "Created: $WORKFLOW_NAME (New ID: $NEW_ID)"
        
        NEW_WORKFLOW_IDS="$NEW_WORKFLOW_IDS $NEW_ID"
        
        # Activate the workflow
        ACTIVATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
            -X PATCH "$N8N_API_URL/workflows/$NEW_ID" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"active": true}')
        
        ACTIVATE_CODE=$(echo "$ACTIVATE_RESPONSE" | tail -1)
        
        if [ "$ACTIVATE_CODE" = "200" ]; then
            log_success "Activated workflow: $NEW_ID"
        else
            log_warning "Could not activate workflow (HTTP $ACTIVATE_CODE) - may need manual activation"
        fi
    else
        log_error "Failed to create workflow (HTTP $HTTP_CODE)"
        echo "$BODY"
        exit 1
    fi
done

echo ""
echo "=============================================="
echo "  Migration Complete!"
echo "=============================================="
echo ""
log_success "Backups saved to: $BACKUP_DIR"
echo ""
echo "Replacements made:"
echo "  - REST API ID: $OLD_REST_API_ID → $NEW_REST_API_ID"
echo "  - HTTP API ID: $OLD_HTTP_API_ID → $NEW_HTTP_API_ID"
echo "  - AWS API Key: ${OLD_AWS_API_KEY:0:10}... → ${NEW_AWS_API_KEY:0:10}..."
echo ""
echo "New workflow IDs:$NEW_WORKFLOW_IDS"
echo ""
log_warning "Note: Workflow IDs have changed! Update any references."
echo ""

# Cleanup temp directory
rm -rf "$TEMP_DIR"
log_info "Cleaned up temp directory"
