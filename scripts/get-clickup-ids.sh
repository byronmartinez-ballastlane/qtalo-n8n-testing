#!/bin/bash

# Interactive ClickUp ID Fetcher
# Gets your ClickUp workspace IDs for automated deployment

set -e

API_KEY="${1:-$CLICKUP_API_KEY}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ ClickUp API Key required${NC}"
    echo ""
    echo "Usage:"
    echo "  ./get-clickup-ids.sh YOUR_CLICKUP_API_KEY"
    echo ""
    echo "Or set environment variable:"
    echo "  export CLICKUP_API_KEY='your_key'"
    echo "  ./get-clickup-ids.sh"
    echo ""
    echo "Get your API key at: https://app.clickup.com/settings/apps"
    exit 1
fi

echo -e "${BLUE}🔍 Fetching ClickUp workspace structure...${NC}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found, installing...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    else
        echo -e "${RED}Please install jq: https://stedolan.github.io/jq/download/${NC}"
        exit 1
    fi
fi

# Get Team
echo -e "${GREEN}📁 Fetching teams...${NC}"
TEAMS_JSON=$(curl -s "https://api.clickup.com/api/v2/team" \
  -H "Authorization: $API_KEY")

if echo "$TEAMS_JSON" | jq -e '.err' > /dev/null 2>&1; then
    echo -e "${RED}❌ Failed to fetch teams. Check your API key.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Available Teams:${NC}"
echo "$TEAMS_JSON" | jq -r '.teams[] | "  • \(.name) (ID: \(.id))"'

TEAM_COUNT=$(echo "$TEAMS_JSON" | jq -r '.teams | length')

if [ "$TEAM_COUNT" -eq 1 ]; then
    TEAM_ID=$(echo "$TEAMS_JSON" | jq -r '.teams[0].id')
    TEAM_NAME=$(echo "$TEAMS_JSON" | jq -r '.teams[0].name')
    echo ""
    echo -e "${GREEN}✓ Auto-selected: $TEAM_NAME${NC}"
else
    echo ""
    read -p "Enter Team ID: " TEAM_ID
fi

# Get Spaces
echo ""
echo -e "${GREEN}📂 Fetching spaces...${NC}"
SPACES_JSON=$(curl -s "https://api.clickup.com/api/v2/team/$TEAM_ID/space" \
  -H "Authorization: $API_KEY")

echo ""
echo -e "${BLUE}Available Spaces:${NC}"
echo "$SPACES_JSON" | jq -r '.spaces[] | "  • \(.name) (ID: \(.id))"'

SPACE_COUNT=$(echo "$SPACES_JSON" | jq -r '.spaces | length')

if [ "$SPACE_COUNT" -eq 1 ]; then
    SPACE_ID=$(echo "$SPACES_JSON" | jq -r '.spaces[0].id')
    SPACE_NAME=$(echo "$SPACES_JSON" | jq -r '.spaces[0].name')
    echo ""
    echo -e "${GREEN}✓ Auto-selected: $SPACE_NAME${NC}"
else
    echo ""
    read -p "Enter Space ID: " SPACE_ID
fi

# Get Folders (optional)
echo ""
echo -e "${GREEN}📁 Fetching folders...${NC}"
FOLDERS_JSON=$(curl -s "https://api.clickup.com/api/v2/space/$SPACE_ID/folder" \
  -H "Authorization: $API_KEY")

FOLDER_COUNT=$(echo "$FOLDERS_JSON" | jq -r '.folders | length' 2>/dev/null || echo "0")

FOLDER_ID=""
if [ "$FOLDER_COUNT" -gt 0 ]; then
    echo ""
    echo -e "${BLUE}Available Folders:${NC}"
    echo "$FOLDERS_JSON" | jq -r '.folders[] | "  • \(.name) (ID: \(.id))"'
    echo ""
    read -p "Enter Folder ID (or press Enter to skip): " FOLDER_ID
fi

# Get Lists
echo ""
echo -e "${GREEN}📋 Fetching lists...${NC}"

if [ -n "$FOLDER_ID" ]; then
    LISTS_JSON=$(curl -s "https://api.clickup.com/api/v2/folder/$FOLDER_ID/list" \
      -H "Authorization: $API_KEY")
else
    LISTS_JSON=$(curl -s "https://api.clickup.com/api/v2/space/$SPACE_ID/list" \
      -H "Authorization: $API_KEY")
fi

echo ""
echo -e "${BLUE}Available Lists:${NC}"
echo "$LISTS_JSON" | jq -r '.lists[] | "  • \(.name) (ID: \(.id))"'

LIST_COUNT=$(echo "$LISTS_JSON" | jq -r '.lists | length')

if [ "$LIST_COUNT" -eq 1 ]; then
    LIST_ID=$(echo "$LISTS_JSON" | jq -r '.lists[0].id')
    LIST_NAME=$(echo "$LISTS_JSON" | jq -r '.lists[0].name')
    echo ""
    echo -e "${GREEN}✓ Auto-selected: $LIST_NAME${NC}"
else
    echo ""
    read -p "Enter List ID: " LIST_ID
fi

# Output
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Configuration Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Add these to your .env file:${NC}"
echo ""
echo "CLICKUP_API_KEY=$API_KEY"
echo "CLICKUP_TEAM_ID=$TEAM_ID"
echo "CLICKUP_SPACE_ID=$SPACE_ID"
if [ -n "$FOLDER_ID" ]; then
    echo "CLICKUP_FOLDER_ID=$FOLDER_ID"
fi
echo "CLICKUP_LIST_ID=$LIST_ID"
echo ""

# Offer to append to .env
read -p "Append to .env file? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "" >> .env
    echo "# ClickUp Configuration (auto-generated)" >> .env
    echo "CLICKUP_API_KEY=$API_KEY" >> .env
    echo "CLICKUP_TEAM_ID=$TEAM_ID" >> .env
    echo "CLICKUP_SPACE_ID=$SPACE_ID" >> .env
    if [ -n "$FOLDER_ID" ]; then
        echo "CLICKUP_FOLDER_ID=$FOLDER_ID" >> .env
    fi
    echo "CLICKUP_LIST_ID=$LIST_ID" >> .env
    
    echo -e "${GREEN}✅ Added to .env file!${NC}"
    echo ""
    echo -e "${BLUE}Next step: Run deployment${NC}"
    echo "  npm run deploy"
else
    echo ""
    echo -e "${BLUE}Copy the configuration above and add it to .env manually${NC}"
fi
