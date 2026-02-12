# ============================================================
# GitHub Actions OIDC Provider + IAM Role
# ============================================================
# Allows GitHub Actions to assume an IAM role via OIDC
# (no static AWS credentials needed as repo secrets).
#
# The role has permissions to:
#   1. Invoke the JWT rotation Lambda (post-deploy step)
# ============================================================

module "github_oidc" {
  source  = "terraform-module/github-oidc-provider/aws"
  version = "~> 2"

  create_oidc_provider = true
  create_oidc_role     = true

  repositories = ["byronmartinez-ballastlane/qtalo-n8n-testing:ref:refs/heads/main"]

  role_name        = "${var.project_name}-github-actions-${var.environment}"
  role_description = "Role assumed by GitHub Actions to deploy n8n system workflows"

  oidc_role_attach_policies = [
    aws_iam_policy.github_actions_deploy.arn
  ]

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ============================================================
# IAM Policy: Lambda invoke for JWT rotation
# ============================================================

resource "aws_iam_policy" "github_actions_deploy" {
  name        = "${var.project_name}-github-actions-deploy-${var.environment}"
  description = "Allows GitHub Actions to invoke the JWT rotation Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeJWTRotationLambda"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = aws_lambda_function.secret_rotation.arn
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ============================================================
# Outputs
# ============================================================

output "github_actions_role_arn" {
  description = "IAM Role ARN for GitHub Actions to assume via OIDC"
  value       = module.github_oidc.oidc_role
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC Provider ARN"
  value       = module.github_oidc.oidc_provider_arn
}
