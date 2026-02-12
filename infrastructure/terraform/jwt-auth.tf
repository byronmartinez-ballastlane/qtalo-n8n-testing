# ============================================================
# JWT Authentication Infrastructure
# ============================================================
# This file contains all resources needed for JWT-based 
# authentication for the API Gateway:
# - Secrets Manager secrets for JWT signing key
# - JWT Authorizer Lambda
# - Secret Rotation Lambda
# - EventBridge rule for scheduled rotation
# - API Gateway Authorizer
# - API Key and Usage Plan
# ============================================================

# ============================================================
# Secrets Manager - JWT Signing Secret
# ============================================================

resource "aws_secretsmanager_secret" "jwt_signing_secret" {
  name        = "n8n/clients/qtalo/jwt-signing-secret"
  description = "JWT signing secret for n8n API Gateway authentication"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "jwt-signing"
  }
}

# Initial secret value - will be rotated automatically
resource "aws_secretsmanager_secret_version" "jwt_signing_secret_initial" {
  secret_id = aws_secretsmanager_secret.jwt_signing_secret.id
  secret_string = jsonencode({
    secret    = random_password.initial_jwt_secret.result
    createdAt = timestamp()
    rotatedBy = "terraform-initial"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Generate initial random secret
resource "random_password" "initial_jwt_secret" {
  length  = 64 # 32 bytes in hex = 64 characters
  special = false
}

# ============================================================
# JWT Authorizer Lambda
# ============================================================

# IAM Role for JWT Authorizer Lambda
resource "aws_iam_role" "jwt_authorizer_role" {
  name = "${var.project_name}-jwt-authorizer-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM Policy for JWT Authorizer Lambda
resource "aws_iam_role_policy" "jwt_authorizer_policy" {
  name = "${var.project_name}-jwt-authorizer-policy-${var.environment}"
  role = aws_iam_role.jwt_authorizer_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.jwt_signing_secret.arn
      }
    ]
  })
}

# Zip the JWT Authorizer Lambda code
data "archive_file" "jwt_authorizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../jwt-authorizer"
  output_path = "${path.module}/../jwt-authorizer.zip"
  excludes    = ["node_modules", "test.js", "*.zip"]
}

# Upload JWT Authorizer Lambda to S3
resource "aws_s3_object" "jwt_authorizer_code" {
  bucket = aws_s3_bucket.lambda_deployments.bucket
  key    = "jwt-authorizer/lambda-${data.archive_file.jwt_authorizer_zip.output_md5}.zip"
  source = data.archive_file.jwt_authorizer_zip.output_path
  etag   = data.archive_file.jwt_authorizer_zip.output_md5

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# JWT Authorizer Lambda Function
resource "aws_lambda_function" "jwt_authorizer" {
  function_name = "${var.project_name}-jwt-authorizer-${var.environment}"
  role          = aws_iam_role.jwt_authorizer_role.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 10
  memory_size   = 128

  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = aws_s3_object.jwt_authorizer_code.key

  environment {
    variables = {
      JWT_SECRET_NAME = aws_secretsmanager_secret.jwt_signing_secret.name
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudWatch Log Group for JWT Authorizer
resource "aws_cloudwatch_log_group" "jwt_authorizer_logs" {
  name              = "/aws/lambda/${aws_lambda_function.jwt_authorizer.function_name}"
  retention_in_days = 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============================================================
# Secret Rotation Lambda
# ============================================================

# IAM Role for Secret Rotation Lambda
resource "aws_iam_role" "secret_rotation_role" {
  name = "${var.project_name}-secret-rotation-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM Policy for Secret Rotation Lambda
resource "aws_iam_role_policy" "secret_rotation_policy" {
  name = "${var.project_name}-secret-rotation-policy-${var.environment}"
  role = aws_iam_role.secret_rotation_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.jwt_signing_secret.arn
      },
      {
        Effect   = "Allow"
        Action   = "lambda:UpdateFunctionConfiguration"
        Resource = aws_lambda_function.jwt_authorizer.arn
      }
    ]
  })
}

# Zip the Secret Rotation Lambda code
data "archive_file" "secret_rotation_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../secret-rotation"
  output_path = "${path.module}/../secret-rotation.zip"
  excludes    = ["node_modules", "test.js", "*.zip"]
}

# Upload Secret Rotation Lambda to S3
resource "aws_s3_object" "secret_rotation_code" {
  bucket = aws_s3_bucket.lambda_deployments.bucket
  key    = "secret-rotation/lambda-${data.archive_file.secret_rotation_zip.output_md5}.zip"
  source = data.archive_file.secret_rotation_zip.output_path
  etag   = data.archive_file.secret_rotation_zip.output_md5

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Secret Rotation Lambda Function
resource "aws_lambda_function" "secret_rotation" {
  function_name = "${var.project_name}-secret-rotation-${var.environment}"
  role          = aws_iam_role.secret_rotation_role.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60
  memory_size   = 128

  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = aws_s3_object.secret_rotation_code.key

  environment {
    variables = {
      JWT_SECRET_NAME          = aws_secretsmanager_secret.jwt_signing_secret.name
      N8N_API_URL              = var.n8n_api_url
      N8N_CREDENTIAL_NAME      = var.n8n_jwt_credential_name
      AUTHORIZER_FUNCTION_NAME = aws_lambda_function.jwt_authorizer.function_name
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudWatch Log Group for Secret Rotation
resource "aws_cloudwatch_log_group" "secret_rotation_logs" {
  name              = "/aws/lambda/${aws_lambda_function.secret_rotation.function_name}"
  retention_in_days = 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============================================================
# EventBridge Rule for Scheduled Rotation
# ============================================================

# EventBridge rule to trigger rotation every 6 hours
resource "aws_cloudwatch_event_rule" "secret_rotation_schedule" {
  name                = "${var.project_name}-secret-rotation-schedule-${var.environment}"
  description         = "Trigger JWT secret rotation every 6 hours"
  schedule_expression = "rate(6 hours)"

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# EventBridge target - the rotation Lambda
resource "aws_cloudwatch_event_target" "secret_rotation_target" {
  rule      = aws_cloudwatch_event_rule.secret_rotation_schedule.name
  target_id = "secret-rotation-lambda"
  arn       = aws_lambda_function.secret_rotation.arn
}

# Permission for EventBridge to invoke the rotation Lambda
resource "aws_lambda_permission" "allow_eventbridge_rotation" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.secret_rotation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.secret_rotation_schedule.arn
}

# ============================================================
# API Gateway Authorizer
# ============================================================

resource "aws_api_gateway_authorizer" "jwt_authorizer" {
  name                             = "jwt-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.api.id
  authorizer_uri                   = aws_lambda_function.jwt_authorizer.invoke_arn
  authorizer_credentials           = aws_iam_role.api_gateway_authorizer_role.arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 300 # Cache auth results for 5 minutes
}

# IAM Role for API Gateway to invoke the authorizer Lambda
resource "aws_iam_role" "api_gateway_authorizer_role" {
  name = "${var.project_name}-api-gw-authorizer-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "api_gateway_authorizer_policy" {
  name = "${var.project_name}-api-gw-authorizer-policy-${var.environment}"
  role = aws_iam_role.api_gateway_authorizer_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.jwt_authorizer.arn
      }
    ]
  })
}

# Permission for API Gateway to invoke JWT Authorizer Lambda
resource "aws_lambda_permission" "api_gateway_authorizer" {
  statement_id  = "AllowAPIGatewayAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.jwt_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/authorizers/${aws_api_gateway_authorizer.jwt_authorizer.id}"
}

# ============================================================
# API Key (Simple - No Usage Plan)
# ============================================================

resource "aws_api_gateway_api_key" "n8n_api_key" {
  name    = "${var.project_name}-api-key-${var.environment}"
  enabled = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Note: API Gateway API Key value is stored in n8n, not in Secrets Manager

# Usage Plan (required even for simple API key)
resource "aws_api_gateway_usage_plan" "n8n_usage_plan" {
  name        = "${var.project_name}-usage-plan-${var.environment}"
  description = "Usage plan for n8n API integration"

  api_stages {
    api_id = aws_api_gateway_rest_api.api.id
    stage  = aws_api_gateway_stage.api.stage_name
  }

  # No throttling or quota limits - just enable API key requirement
  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_api_gateway_usage_plan_key" "n8n_usage_plan_key" {
  key_id        = aws_api_gateway_api_key.n8n_api_key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.n8n_usage_plan.id
}

# ============================================================
# Outputs
# ============================================================

output "jwt_authorizer_lambda_arn" {
  description = "ARN of the JWT Authorizer Lambda"
  value       = aws_lambda_function.jwt_authorizer.arn
}

output "secret_rotation_lambda_arn" {
  description = "ARN of the Secret Rotation Lambda"
  value       = aws_lambda_function.secret_rotation.arn
}

output "jwt_secret_arn" {
  description = "ARN of the JWT signing secret in Secrets Manager"
  value       = aws_secretsmanager_secret.jwt_signing_secret.arn
}

output "api_key_id" {
  description = "ID of the API Gateway API Key"
  value       = aws_api_gateway_api_key.n8n_api_key.id
}

output "api_key_value" {
  description = "Value of the API Gateway API Key (sensitive)"
  value       = aws_api_gateway_api_key.n8n_api_key.value
  sensitive   = true
}
