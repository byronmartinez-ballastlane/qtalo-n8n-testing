# ============================================================
# GitHub Actions Repository Secrets
# ============================================================
# Creates all secrets needed by the deploy-system-workflows
# GitHub Actions workflow. Values come from the same config
# that's in the local .env file.
#
# The deploy.py script reads these as env vars at runtime
# instead of using SSM Parameter Store.
# ============================================================

# ============================================================
# Data: look up the repo
# ============================================================

data "github_repository" "this" {
  full_name = "byronmartinez-ballastlane/${var.github_repo}"
}

# ============================================================
# Secret: AWS_ROLE_ARN (for OIDC assume-role)
# ============================================================

resource "github_actions_secret" "aws_role_arn" {
  repository      = data.github_repository.this.name
  secret_name     = "AWS_ROLE_ARN"
  plaintext_value = module.github_oidc.oidc_role
}

# ============================================================
# Secrets: n8n deploy configuration
# ============================================================

resource "github_actions_secret" "n8n_api_url" {
  repository      = data.github_repository.this.name
  secret_name     = "N8N_API_URL"
  plaintext_value = "https://qtalospace.app.n8n.cloud/api/v1"
}

resource "github_actions_secret" "n8n_api_key" {
  repository      = data.github_repository.this.name
  secret_name     = "N8N_API_KEY"
  plaintext_value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjZkNTI3MC00YjI4LTQ0MmItYWJhZi01MjMwNGUwZTdlMGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2NDU3NjE0fQ.kUqry1F6XGZf-HEQyUYVBAqyPBbAGX42_u8EXi0YiJ8"
}

resource "github_actions_secret" "n8n_host" {
  repository      = data.github_repository.this.name
  secret_name     = "N8N_HOST"
  plaintext_value = "qtalospace.app.n8n.cloud"
}

resource "github_actions_secret" "n8n_project_id" {
  repository      = data.github_repository.this.name
  secret_name     = "N8N_PROJECT_ID"
  plaintext_value = "BFIDAvXOISVZh7tb"
}

resource "github_actions_secret" "github_credential_id" {
  repository      = data.github_repository.this.name
  secret_name     = "GH_CREDENTIAL_ID"
  plaintext_value = "Q6oSPWOEORCm73TJ"
}

resource "github_actions_secret" "n8n_credential_id" {
  repository      = data.github_repository.this.name
  secret_name     = "N8N_CREDENTIAL_ID"
  plaintext_value = "EaOQcyWDYyvGbbr7"
}

resource "github_actions_secret" "aws_api_gateway_url" {
  repository      = data.github_repository.this.name
  secret_name     = "AWS_API_GATEWAY_URL"
  plaintext_value = "https://r81lwr2etg.execute-api.us-east-1.amazonaws.com/prod"
}

resource "github_actions_secret" "clickup_api_url" {
  repository      = data.github_repository.this.name
  secret_name     = "CLICKUP_API_URL"
  plaintext_value = "https://api.clickup.com/api/v2"
}

resource "github_actions_secret" "github_owner" {
  repository      = data.github_repository.this.name
  secret_name     = "GH_OWNER"
  plaintext_value = "byronmartinez-ballastlane"
}

resource "github_actions_secret" "github_repo" {
  repository      = data.github_repository.this.name
  secret_name     = "GH_REPO"
  plaintext_value = "qtalo-n8n-testing"
}

resource "github_actions_secret" "clickup_system_credential_id" {
  repository      = data.github_repository.this.name
  secret_name     = "CLICKUP_SYSTEM_CREDENTIAL_ID"
  plaintext_value = "KQ4DCkxv3kBoRgK1"
}
