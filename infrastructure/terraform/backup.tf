# AWS Backup for DynamoDB table - daily backups with 35-day retention

# Backup vault
resource "aws_backup_vault" "dynamodb" {
  name = "${var.project_name}-dynamodb-backup-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Backup plan - daily at 3:00 AM UTC, 35-day retention
resource "aws_backup_plan" "dynamodb_daily" {
  name = "${var.project_name}-dynamodb-daily-${var.environment}"

  rule {
    rule_name         = "daily-backup"
    target_vault_name = aws_backup_vault.dynamodb.name
    schedule          = "cron(0 3 * * ? *)" # Daily at 3:00 AM UTC

    lifecycle {
      delete_after = 35 # Keep backups for 35 days
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# IAM role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "${var.project_name}-backup-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach the AWS managed backup policies
resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restores" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Backup selection - target the DynamoDB table
resource "aws_backup_selection" "dynamodb" {
  name         = "${var.project_name}-dynamodb-${var.environment}"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.dynamodb_daily.id

  resources = [
    aws_dynamodb_table.clients.arn
  ]
}
