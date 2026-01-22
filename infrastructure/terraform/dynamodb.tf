# DynamoDB table for client configuration and metadata
resource "aws_dynamodb_table" "clients" {
  name         = "${var.project_name}-clients-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "client_id"

  attribute {
    name = "client_id"
    type = "S"
  }

  # Optional: Add status as a GSI for querying by status
  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    projection_type = "ALL"
  }

  # Enable point-in-time recovery for data protection
  point_in_time_recovery {
    enabled = true
  }

  # Enable server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Output the table name and ARN
output "dynamodb_table_name" {
  description = "Name of the DynamoDB clients table"
  value       = aws_dynamodb_table.clients.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB clients table"
  value       = aws_dynamodb_table.clients.arn
}
