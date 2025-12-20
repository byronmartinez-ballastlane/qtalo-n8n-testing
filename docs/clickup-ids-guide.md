# Getting Your ClickUp Workspace IDs

To fully automate the deployment, you need to get your ClickUp workspace IDs.

## Quick Method (Using ClickUp API)

### 1. Get your ClickUp API Key
1. Go to https://app.clickup.com/settings/apps
2. Click "Generate" under **API Token**
3. Copy the token

### 2. Get Team ID
```bash
curl "https://api.clickup.com/api/v2/team" \
  -H "Authorization: YOUR_CLICKUP_API_KEY"
```

Look for: `"id": "123456789"` - this is your **CLICKUP_TEAM_ID**

### 3. Get Space ID
```bash
curl "https://api.clickup.com/api/v2/team/YOUR_TEAM_ID/space" \
  -H "Authorization: YOUR_CLICKUP_API_KEY"
```

Look for your space, copy its `"id"` - this is your **CLICKUP_SPACE_ID**

### 4. Get Folder ID (optional)
```bash
curl "https://api.clickup.com/api/v2/space/YOUR_SPACE_ID/folder" \
  -H "Authorization: YOUR_CLICKUP_API_KEY"
```

Copy the folder `"id"` - this is your **CLICKUP_FOLDER_ID**

### 5. Get List ID
```bash
curl "https://api.clickup.com/api/v2/folder/YOUR_FOLDER_ID/list" \
  -H "Authorization: YOUR_CLICKUP_API_KEY"
```

Or if no folder:
```bash
curl "https://api.clickup.com/api/v2/space/YOUR_SPACE_ID/list" \
  -H "Authorization: YOUR_CLICKUP_API_KEY"
```

Copy the list `"id"` - this is your **CLICKUP_LIST_ID**

## Easy Method (Using Browser)

### Get IDs from URLs in ClickUp:

When you open a list in ClickUp, the URL looks like:
```
https://app.clickup.com/TEAM_ID/v/li/LIST_ID
```

Example:
```
https://app.clickup.com/123456789/v/li/987654321
                      ↑               ↑
                   TEAM_ID         LIST_ID
```

## Add to .env

Once you have the IDs, add them to your `.env` file:

```bash
# ClickUp Configuration
CLICKUP_API_KEY=pk_123456_ABCDEFGHIJKLMNOP
CLICKUP_TEAM_ID=123456789
CLICKUP_SPACE_ID=987654321
CLICKUP_FOLDER_ID=456789123  # Optional
CLICKUP_LIST_ID=789123456
```

## Quick Script

Save this as `scripts/get-clickup-ids.sh`:

```bash
#!/bin/bash

API_KEY="${1:-$CLICKUP_API_KEY}"

if [ -z "$API_KEY" ]; then
    echo "Usage: ./get-clickup-ids.sh YOUR_CLICKUP_API_KEY"
    echo "Or set CLICKUP_API_KEY environment variable"
    exit 1
fi

echo "🔍 Fetching ClickUp workspace structure..."
echo ""

# Get Team
echo "📁 Teams:"
curl -s "https://api.clickup.com/api/v2/team" \
  -H "Authorization: $API_KEY" | jq -r '.teams[] | "  \(.name) (ID: \(.id))"'

echo ""
read -p "Enter Team ID: " TEAM_ID

# Get Spaces
echo ""
echo "📂 Spaces:"
curl -s "https://api.clickup.com/api/v2/team/$TEAM_ID/space" \
  -H "Authorization: $API_KEY" | jq -r '.spaces[] | "  \(.name) (ID: \(.id))"'

echo ""
read -p "Enter Space ID: " SPACE_ID

# Get Lists
echo ""
echo "📋 Lists:"
curl -s "https://api.clickup.com/api/v2/space/$SPACE_ID/list" \
  -H "Authorization: $API_KEY" | jq -r '.lists[] | "  \(.name) (ID: \(.id))"'

echo ""
read -p "Enter List ID: " LIST_ID

# Output .env format
echo ""
echo "✅ Add these to your .env file:"
echo ""
echo "CLICKUP_API_KEY=$API_KEY"
echo "CLICKUP_TEAM_ID=$TEAM_ID"
echo "CLICKUP_SPACE_ID=$SPACE_ID"
echo "CLICKUP_LIST_ID=$LIST_ID"
```

Make it executable and run:
```bash
chmod +x scripts/get-clickup-ids.sh
./scripts/get-clickup-ids.sh YOUR_CLICKUP_API_KEY
```

## After Configuration

Once you've added the IDs to `.env`, run the deployment again:

```bash
npm run deploy
```

All ClickUp nodes will be automatically configured! 🎉
