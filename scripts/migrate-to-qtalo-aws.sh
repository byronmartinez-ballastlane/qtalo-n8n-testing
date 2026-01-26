#!/bin/sh
# ============================================================
# Migration Script: BLA AWS Account → Qtalo AWS Account
# ============================================================
# This script updates all n8n workflow files to use the new
# Qtalo AWS account endpoints.
#
# Usage: ./scripts/migrate-to-qtalo-aws.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# Configuration - OLD (BLA Account)
# ============================================================
OLD_REST_API="zxn1hyal26"
OLD_HTTP_API="oc05p6ctz7"
OLD_ACCOUNT_ID="166565198800"

# ============================================================
# Configuration - NEW (Qtalo Account)
# ============================================================
NEW_REST_API="r81lwr2etg"
NEW_HTTP_API="tvp0h6ee7g"
NEW_ACCOUNT_ID="108758164578"
NEW_API_KEY="6kzMCd0d7Z4TgMemJ2NCT4UF3SmYVR0O2azPpuRv"
NEW_JWT_SECRET="a51257423e683005558941efeb5591da6f6f0fd97b238f46328d5c6554869997"
NEW_LAMBDA_URL="https://myli7kqh3np2xiqb7byes4z35e0ozead.lambda-url.us-east-1.on.aws/"

# ============================================================
# Derived URLs
# ============================================================
OLD_REST_URL="https://${OLD_REST_API}.execute-api.us-east-1.amazonaws.com/prod"
NEW_REST_URL="https://${NEW_REST_API}.execute-api.us-east-1.amazonaws.com/prod"
OLD_HTTP_URL="https://${OLD_HTTP_API}.execute-api.us-east-1.amazonaws.com"
NEW_HTTP_URL="https://${NEW_HTTP_API}.execute-api.us-east-1.amazonaws.com"

# ============================================================
# Script directory
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "${BLUE}============================================================${NC}"
echo "${BLUE}  n8n AWS Migration: BLA → Qtalo${NC}"
echo "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# Pre-flight checks
# ============================================================
echo "${YELLOW}[1/5] Pre-flight checks...${NC}"

if [ ! -d "$PROJECT_DIR/system" ]; then
    echo "${RED}ERROR: system/ directory not found${NC}"
    exit 1
fi

if [ ! -d "$PROJECT_DIR/templates" ]; then
    echo "${RED}ERROR: templates/ directory not found${NC}"
    exit 1
fi

echo "${GREEN}  ✓ Project directories found${NC}"

# ============================================================
# Show what will be changed
# ============================================================
echo ""
echo "${YELLOW}[2/5] Scanning for files to update...${NC}"
echo ""

echo "  ${BLUE}Files with OLD REST API (${OLD_REST_API}):${NC}"
grep -rl "${OLD_REST_API}" "$PROJECT_DIR/system" "$PROJECT_DIR/templates" 2>/dev/null | while read -r file; do
    echo "    - $(basename "$file")"
done

echo ""
echo "  ${BLUE}Files with OLD HTTP API (${OLD_HTTP_API}):${NC}"
grep -rl "${OLD_HTTP_API}" "$PROJECT_DIR/system" "$PROJECT_DIR/templates" 2>/dev/null | while read -r file; do
    echo "    - $(basename "$file")"
done

echo ""
echo "  ${BLUE}Files with OLD Account ID (${OLD_ACCOUNT_ID}):${NC}"
grep -rl "${OLD_ACCOUNT_ID}" "$PROJECT_DIR/system" "$PROJECT_DIR/templates" 2>/dev/null | while read -r file; do
    echo "    - $(basename "$file")"
done || echo "    (none)"

# ============================================================
# Backup
# ============================================================
echo ""
echo "${YELLOW}[3/5] Creating backup...${NC}"

BACKUP_DIR="$PROJECT_DIR/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/system"
mkdir -p "$BACKUP_DIR/templates"

cp -r "$PROJECT_DIR/system/"*.json "$BACKUP_DIR/system/" 2>/dev/null || true
cp -r "$PROJECT_DIR/templates/"*.json "$BACKUP_DIR/templates/" 2>/dev/null || true

echo "${GREEN}  ✓ Backup created at: $BACKUP_DIR${NC}"

# ============================================================
# Perform replacements
# ============================================================
echo ""
echo "${YELLOW}[4/5] Updating workflow files...${NC}"

# Function to replace in files
replace_in_files() {
    old_pattern="$1"
    new_pattern="$2"
    description="$3"
    
    count=0
    for dir in "$PROJECT_DIR/system" "$PROJECT_DIR/templates"; do
        if [ -d "$dir" ]; then
            for file in "$dir"/*.json; do
                if [ -f "$file" ] && grep -q "$old_pattern" "$file" 2>/dev/null; then
                    # Use sed with different syntax for macOS vs Linux
                    if [ "$(uname)" = "Darwin" ]; then
                        sed -i '' "s|${old_pattern}|${new_pattern}|g" "$file"
                    else
                        sed -i "s|${old_pattern}|${new_pattern}|g" "$file"
                    fi
                    count=$((count + 1))
                fi
            done
        fi
    done
    
    if [ $count -gt 0 ]; then
        echo "${GREEN}  ✓ $description: $count file(s) updated${NC}"
    else
        echo "  - $description: no files needed update"
    fi
}

# Replace REST API Gateway ID
replace_in_files "$OLD_REST_API" "$NEW_REST_API" "REST API Gateway"

# Replace HTTP API Gateway ID
replace_in_files "$OLD_HTTP_API" "$NEW_HTTP_API" "HTTP API Gateway"

# Replace AWS Account ID (if any)
replace_in_files "$OLD_ACCOUNT_ID" "$NEW_ACCOUNT_ID" "AWS Account ID"

# ============================================================
# Summary
# ============================================================
echo ""
echo "${YELLOW}[5/5] Migration Summary${NC}"
echo ""
echo "${BLUE}============================================================${NC}"
echo "${BLUE}  OLD (BLA Account) → NEW (Qtalo Account)${NC}"
echo "${BLUE}============================================================${NC}"
echo ""
echo "  ${GREEN}REST API Gateway:${NC}"
echo "    Old: ${OLD_REST_URL}"
echo "    New: ${NEW_REST_URL}"
echo ""
echo "  ${GREEN}HTTP API Gateway (Signatures):${NC}"
echo "    Old: ${OLD_HTTP_URL}"
echo "    New: ${NEW_HTTP_URL}"
echo ""
echo "  ${GREEN}Lambda Function URL:${NC}"
echo "    New: ${NEW_LAMBDA_URL}"
echo ""
echo "${BLUE}============================================================${NC}"
echo "${BLUE}  Credentials to Update in n8n UI${NC}"
echo "${BLUE}============================================================${NC}"
echo ""
echo "  ${YELLOW}1. API Gateway API Key:${NC}"
echo "     Credential Name: Look for 'Header Auth' or 'API Key' credential"
echo "     Header Name: X-Api-Key"
echo "     Header Value: ${NEW_API_KEY}"
echo ""
echo "  ${YELLOW}2. JWT Signing Secret:${NC}"
echo "     Credential Name: AWS API Gateway JWT"
echo "     Type: JWT Auth (HS256)"
echo "     Secret: ${NEW_JWT_SECRET}"
echo ""
echo "${BLUE}============================================================${NC}"
echo "${GREEN}  Migration Complete!${NC}"
echo "${BLUE}============================================================${NC}"
echo ""
echo "  ${YELLOW}Next Steps:${NC}"
echo "  1. Review the changes in system/ and templates/ folders"
echo "  2. Update credentials in n8n UI (see above)"
echo "  3. Test the health endpoint:"
echo "     curl -H 'X-Api-Key: ${NEW_API_KEY}' ${NEW_REST_URL}/health"
echo "  4. Re-import updated workflows to n8n"
echo "  5. Test each workflow"
echo ""
echo "  ${YELLOW}Backup location:${NC} $BACKUP_DIR"
echo ""
