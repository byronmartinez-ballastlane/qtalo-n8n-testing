#!/bin/bash
# ============================================================
# Qtalo n8n Multi-Tenant Deployment Script
# ============================================================
# This script helps deploy templates and system workflows to n8n Cloud.
# It also handles onboarding new clients.
#
# Usage:
#   ./deploy.sh setup              - Initial setup (create AWS resources)
#   ./deploy.sh deploy-system      - Deploy system workflows to n8n
#   ./deploy.sh onboard <client>   - Onboard a new client
#   ./deploy.sh list-clients       - List all clients
#   ./deploy.sh update-templates   - Update all client workflows from templates
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - jq installed for JSON parsing
#   - n8n API key set in N8N_API_KEY environment variable
# ============================================================

set -e

# Configuration
N8N_BASE_URL="${N8N_BASE_URL:-https://qtalospace.app.n8n.cloud/api/v1}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DYNAMODB_TABLE="qtalo-n8n-clients"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ID="BFIDAvXOISVZh7tb"  # Qtalo project ID

# Credential configuration
# Maps credential type -> expected credential name
declare -A CREDENTIAL_CONFIG
CREDENTIAL_CONFIG["githubApi"]="GitHub API - Qtalo"

# Store credential IDs discovered from n8n
declare -A CREDENTIAL_IDS

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Setup required credentials - auto-detect from n8n or create if needed
setup_credentials() {
    log_info "Setting up credentials..."
    
    # Query n8n for all credentials and find the GitHub API one by name
    log_info "Querying n8n for existing credentials..."
    
    # n8n Cloud doesn't have GET /credentials, so we need to check by deploying
    # a test or by using credential schema. We'll use a different approach:
    # Store the expected credential ID in an environment variable or config
    
    # Check if GITHUB_CRED_ID is set in environment or .env
    if [ -n "$GITHUB_CRED_ID" ]; then
        CREDENTIAL_IDS["githubApi"]="$GITHUB_CRED_ID"
        log_info "Using GitHub credential from env: ${CREDENTIAL_IDS["githubApi"]}"
    else
        # Try to create a new credential
        log_warning "GITHUB_CRED_ID not set, creating new GitHub API credential..."
        
        # Check for GitHub PAT in env or prompt
        if [ -z "$GITHUB_PAT" ]; then
            read -p "Enter GitHub Personal Access Token: " GITHUB_PAT
        fi
        
        if [ -z "$GITHUB_USER" ]; then
            GITHUB_USER="byronmartinez-ballastlane"  # Default
        fi
        
        # Create credential via n8n API
        local cred_response=$(curl -s -X POST "$N8N_BASE_URL/credentials" \
            -H "X-N8N-API-KEY: $N8N_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{
                \"name\": \"${CREDENTIAL_CONFIG["githubApi"]}\",
                \"type\": \"githubApi\",
                \"data\": {
                    \"accessToken\": \"$GITHUB_PAT\",
                    \"server\": \"https://api.github.com\",
                    \"user\": \"$GITHUB_USER\"
                }
            }")
        
        if echo "$cred_response" | jq -e '.id' > /dev/null 2>&1; then
            local cred_id=$(echo "$cred_response" | jq -r '.id')
            CREDENTIAL_IDS["githubApi"]="$cred_id"
            
            log_success "Created GitHub API credential (ID: $cred_id)"
            log_info "Add GITHUB_CRED_ID=$cred_id to your .env file for future deployments"
            
            # Transfer to project
            log_info "Transferring credential to Qtalo project..."
            curl -s -X PUT "$N8N_BASE_URL/credentials/$cred_id/transfer" \
                -H "X-N8N-API-KEY: $N8N_API_KEY" \
                -H "Content-Type: application/json" \
                -d "{\"destinationProjectId\": \"$PROJECT_ID\"}" > /dev/null
        else
            log_error "Failed to create GitHub credential"
            echo "$cred_response" | jq '.'
            exit 1
        fi
    fi
    
    log_success "Credentials setup complete"
}

# Inject credentials into workflow JSON
inject_credentials() {
    local workflow_json="$1"
    
    # Replace GitHub API credential references
    if [ -n "${CREDENTIAL_IDS["githubApi"]}" ]; then
        # Update credential ID and name for githubApi type
        workflow_json=$(echo "$workflow_json" | jq --arg id "${CREDENTIAL_IDS["githubApi"]}" --arg name "${CREDENTIAL_CONFIG["githubApi"]}" '
            .nodes |= map(
                if .credentials?.githubApi then
                    .credentials.githubApi.id = $id |
                    .credentials.githubApi.name = $name
                else
                    .
                end
            )
        ')
    fi
    
    echo "$workflow_json"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed. Please install it first."
        exit 1
    fi
    
    if [ -z "$N8N_API_KEY" ]; then
        log_warning "N8N_API_KEY environment variable is not set."
        log_info "Get your API key from n8n Settings > API"
        read -p "Enter your n8n API key: " N8N_API_KEY
        export N8N_API_KEY
    fi
    
    log_success "Prerequisites check passed"
}

# Create AWS resources
setup_aws() {
    log_info "Setting up AWS resources..."
    
    # Create DynamoDB table
    log_info "Creating DynamoDB table: $DYNAMODB_TABLE"
    
    aws dynamodb create-table \
        --table-name "$DYNAMODB_TABLE" \
        --attribute-definitions \
            AttributeName=client_id,AttributeType=S \
            AttributeName=clickup_space_id,AttributeType=S \
        --key-schema \
            AttributeName=client_id,KeyType=HASH \
        --global-secondary-indexes \
            "[{\"IndexName\": \"clickup_space_id-index\",\"KeySchema\":[{\"AttributeName\":\"clickup_space_id\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
        --provisioned-throughput \
            ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region "$AWS_REGION" \
        2>/dev/null || log_warning "Table may already exist"
    
    log_success "AWS resources setup complete"
}

# Deploy system workflows to n8n
deploy_system_workflows() {
    log_info "Deploying system workflows to n8n..."
    
    # First setup credentials
    setup_credentials
    
    for workflow_file in "$SCRIPT_DIR/system/"*.json; do
        if [ -f "$workflow_file" ]; then
            workflow_name=$(basename "$workflow_file" .json)
            log_info "Deploying: $workflow_name"
            
            # Read and inject credentials
            local workflow_json=$(cat "$workflow_file")
            workflow_json=$(inject_credentials "$workflow_json")
            
            # Check if workflow already exists (by name)
            local existing_id=$(curl -s "$N8N_BASE_URL/workflows" \
                -H "X-N8N-API-KEY: $N8N_API_KEY" | \
                jq -r --arg name "$(echo "$workflow_json" | jq -r '.name')" \
                '.data[] | select(.name == $name) | .id' | head -1)
            
            if [ -n "$existing_id" ] && [ "$existing_id" != "null" ]; then
                # Update existing workflow
                log_info "Updating existing workflow (ID: $existing_id)"
                response=$(echo "$workflow_json" | curl -s -X PUT "$N8N_BASE_URL/workflows/$existing_id" \
                    -H "X-N8N-API-KEY: $N8N_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d @-)
                
                if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
                    log_success "Updated $workflow_name (ID: $existing_id)"
                else
                    log_error "Failed to update $workflow_name"
                    echo "$response" | jq '.'
                fi
            else
                # Create new workflow
                response=$(echo "$workflow_json" | curl -s -X POST "$N8N_BASE_URL/workflows" \
                    -H "X-N8N-API-KEY: $N8N_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d @-)
                
                if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
                    workflow_id=$(echo "$response" | jq -r '.id')
                    log_success "Created $workflow_name (ID: $workflow_id)"
                    
                    # Transfer to Qtalo project
                    log_info "Transferring to Qtalo project..."
                    curl -s -X PUT "$N8N_BASE_URL/workflows/$workflow_id/transfer" \
                        -H "X-N8N-API-KEY: $N8N_API_KEY" \
                        -H "Content-Type: application/json" \
                        -d "{\"destinationProjectId\": \"$PROJECT_ID\"}" > /dev/null
                else
                    log_error "Failed to deploy $workflow_name"
                    echo "$response" | jq '.'
                fi
            fi
        fi
    done
    
    log_success "System workflows deployment complete"
}

# Onboard a new client
onboard_client() {
    local client_id="$1"
    local client_name="$2"
    
    if [ -z "$client_id" ] || [ -z "$client_name" ]; then
        log_error "Usage: ./deploy.sh onboard <client_id> <client_name>"
        log_info "Example: ./deploy.sh onboard acme 'ACME Corp'"
        exit 1
    fi
    
    log_info "Onboarding client: $client_name ($client_id)"
    
    # Get API keys
    read -p "Enter Reply.io API key for $client_name: " reply_api_key
    read -p "Enter ClickUp API key for $client_name: " clickup_api_key
    read -p "Enter Reply.io workspace ID (optional): " reply_workspace_id
    read -p "Enter ClickUp space ID (optional): " clickup_space_id
    
    # Create secret in AWS Secrets Manager
    log_info "Creating secret in AWS Secrets Manager..."
    secret_value=$(cat <<EOF
{
    "reply_api_key": "$reply_api_key",
    "clickup_api_key": "$clickup_api_key",
    "reply_workspace_id": "${reply_workspace_id:-default}",
    "clickup_workspace_id": "${clickup_space_id:-default}"
}
EOF
)
    
    secret_arn=$(aws secretsmanager create-secret \
        --name "n8n/clients/$client_id" \
        --secret-string "$secret_value" \
        --region "$AWS_REGION" \
        --query 'ARN' \
        --output text 2>/dev/null || \
        aws secretsmanager put-secret-value \
            --secret-id "n8n/clients/$client_id" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION" \
            --query 'ARN' \
            --output text)
    
    log_success "Secret created: $secret_arn"
    
    # Clone templates for client
    log_info "Creating client workflows from templates..."
    
    workflow_ids="{}"
    
    for template_file in "$SCRIPT_DIR/templates/"*.template.json; do
        if [ -f "$template_file" ]; then
            template_name=$(basename "$template_file" .template.json)
            log_info "Creating workflow from template: $template_name"
            
            # Replace placeholders in template
            workflow_json=$(cat "$template_file" | \
                sed "s/{{CLIENT_ID}}/$client_id/g" | \
                sed "s/{{CLIENT_NAME}}/$client_name/g" | \
                sed "s/{{REPLY_API_KEY}}/$reply_api_key/g" | \
                sed "s/{{CLICKUP_API_KEY}}/$clickup_api_key/g")
            
            # Create workflow in n8n
            response=$(echo "$workflow_json" | curl -s -X POST "$N8N_BASE_URL/workflows" \
                -H "X-N8N-API-KEY: $N8N_API_KEY" \
                -H "Content-Type: application/json" \
                -d @-)
            
            if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
                workflow_id=$(echo "$response" | jq -r '.id')
                log_success "Created $client_name - $template_name (ID: $workflow_id)"
                
                # Add to workflow_ids map
                workflow_ids=$(echo "$workflow_ids" | jq --arg name "$template_name" --arg id "$workflow_id" '. + {($name): {"S": $id}}')
            else
                log_error "Failed to create workflow: $template_name"
                echo "$response" | jq '.'
            fi
        fi
    done
    
    # Create DynamoDB record
    log_info "Creating DynamoDB record..."
    
    aws dynamodb put-item \
        --table-name "$DYNAMODB_TABLE" \
        --item "{
            \"client_id\": {\"S\": \"$client_id\"},
            \"client_name\": {\"S\": \"$client_name\"},
            \"clickup_space_id\": {\"S\": \"${clickup_space_id:-$client_id}\"},
            \"secrets_arn\": {\"S\": \"$secret_arn\"},
            \"template_version\": {\"S\": \"1.0.0\"},
            \"status\": {\"S\": \"active\"},
            \"workflow_ids\": {\"M\": $workflow_ids},
            \"created_at\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"},
            \"updated_at\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
        }" \
        --region "$AWS_REGION"
    
    log_success "Client $client_name onboarded successfully!"
    
    # Save client config locally
    mkdir -p "$SCRIPT_DIR/clients/$client_id"
    echo "{
        \"client_id\": \"$client_id\",
        \"client_name\": \"$client_name\",
        \"secrets_arn\": \"$secret_arn\",
        \"workflow_ids\": $workflow_ids,
        \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }" | jq '.' > "$SCRIPT_DIR/clients/$client_id/config.json"
    
    log_info "Client config saved to: clients/$client_id/config.json"
}

# List all clients
list_clients() {
    log_info "Listing all clients..."
    
    aws dynamodb scan \
        --table-name "$DYNAMODB_TABLE" \
        --region "$AWS_REGION" \
        --query 'Items[*].{client_id:client_id.S,client_name:client_name.S,status:status.S,template_version:template_version.S}' \
        --output table
}

# Update all client workflows from templates
update_templates() {
    log_info "Updating all client workflows from templates..."
    
    # Get all clients
    clients=$(aws dynamodb scan \
        --table-name "$DYNAMODB_TABLE" \
        --filter-expression "#status = :active" \
        --expression-attribute-names '{"#status": "status"}' \
        --expression-attribute-values '{":active": {"S": "active"}}' \
        --region "$AWS_REGION")
    
    echo "$clients" | jq -r '.Items[] | @base64' | while read client_b64; do
        client=$(echo "$client_b64" | base64 -d)
        client_id=$(echo "$client" | jq -r '.client_id.S')
        client_name=$(echo "$client" | jq -r '.client_name.S')
        
        log_info "Updating workflows for: $client_name ($client_id)"
        
        # Get credentials from Secrets Manager
        secret_arn=$(echo "$client" | jq -r '.secrets_arn.S')
        credentials=$(aws secretsmanager get-secret-value \
            --secret-id "$secret_arn" \
            --region "$AWS_REGION" \
            --query 'SecretString' \
            --output text)
        
        reply_api_key=$(echo "$credentials" | jq -r '.reply_api_key')
        clickup_api_key=$(echo "$credentials" | jq -r '.clickup_api_key')
        
        # Update each workflow
        workflow_ids=$(echo "$client" | jq -r '.workflow_ids.M')
        
        for template_file in "$SCRIPT_DIR/templates/"*.template.json; do
            if [ -f "$template_file" ]; then
                template_name=$(basename "$template_file" .template.json)
                workflow_id=$(echo "$workflow_ids" | jq -r --arg name "$template_name" '.[$name].S // empty')
                
                if [ -n "$workflow_id" ]; then
                    log_info "Updating: $template_name (ID: $workflow_id)"
                    
                    # Replace placeholders in template
                    workflow_json=$(cat "$template_file" | \
                        sed "s/{{CLIENT_ID}}/$client_id/g" | \
                        sed "s/{{CLIENT_NAME}}/$client_name/g" | \
                        sed "s/{{REPLY_API_KEY}}/$reply_api_key/g" | \
                        sed "s/{{CLICKUP_API_KEY}}/$clickup_api_key/g")
                    
                    # Update workflow in n8n
                    response=$(echo "$workflow_json" | curl -s -X PUT "$N8N_BASE_URL/workflows/$workflow_id" \
                        -H "X-N8N-API-KEY: $N8N_API_KEY" \
                        -H "Content-Type: application/json" \
                        -d @-)
                    
                    if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
                        log_success "Updated $template_name"
                    else
                        log_error "Failed to update $template_name"
                    fi
                fi
            fi
        done
        
        # Update template version in DynamoDB
        aws dynamodb update-item \
            --table-name "$DYNAMODB_TABLE" \
            --key "{\"client_id\": {\"S\": \"$client_id\"}}" \
            --update-expression "SET template_version = :v, updated_at = :u" \
            --expression-attribute-values "{\":v\": {\"S\": \"1.0.0\"}, \":u\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" \
            --region "$AWS_REGION"
    done
    
    log_success "All client workflows updated"
}

# Main command handler
case "${1:-help}" in
    setup)
        check_prerequisites
        setup_aws
        ;;
    deploy-system)
        check_prerequisites
        deploy_system_workflows
        ;;
    onboard)
        check_prerequisites
        onboard_client "$2" "$3"
        ;;
    list-clients)
        check_prerequisites
        list_clients
        ;;
    update-templates)
        check_prerequisites
        update_templates
        ;;
    help|*)
        echo "Qtalo n8n Multi-Tenant Deployment Script"
        echo ""
        echo "Usage:"
        echo "  ./deploy.sh setup              - Initial setup (create AWS resources)"
        echo "  ./deploy.sh deploy-system      - Deploy system workflows to n8n"
        echo "  ./deploy.sh onboard <id> <name> - Onboard a new client"
        echo "  ./deploy.sh list-clients       - List all clients"
        echo "  ./deploy.sh update-templates   - Update all client workflows"
        echo ""
        echo "Environment variables:"
        echo "  N8N_API_KEY    - n8n API key (required)"
        echo "  N8N_BASE_URL   - n8n API base URL (default: https://qtalospace.app.n8n.cloud/api/v1)"
        echo "  AWS_REGION     - AWS region (default: us-east-1)"
        ;;
esac
