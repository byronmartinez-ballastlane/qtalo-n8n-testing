# ============================================================
# IAM Role for Lambda
# ============================================================

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role-${var.environment}"

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

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_role.id

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
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.clients.arn,
          "${aws_dynamodb_table.clients.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:UpdateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:n8n/clients/*"
      }
    ]
  })
}

# ============================================================
# S3 Bucket for Lambda Deployment
# ============================================================

# Get current AWS account ID for unique bucket naming
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "${var.project_name}-lambda-deployments-${data.aws_caller_identity.current.account_id}-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ============================================================
# Lambda Function
# ============================================================

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/lambda-package.zip"
}

resource "aws_s3_object" "lambda_package" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "client-manager/${var.environment}/lambda-${data.archive_file.lambda_zip.output_base64sha256}.zip"
  source = data.archive_file.lambda_zip.output_path
  etag   = filemd5(data.archive_file.lambda_zip.output_path)

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_lambda_function" "client_manager" {
  function_name = "${var.project_name}-client-manager-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  s3_bucket        = aws_s3_bucket.lambda_deployments.id
  s3_key           = aws_s3_object.lambda_package.key
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.clients.name
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  depends_on = [aws_s3_object.lambda_package]
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.client_manager.function_name}"
  retention_in_days = 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============================================================
# Reply.io Signature Automation Lambda
# ============================================================

# IAM Role for Signature Lambda (Puppeteer-based)
resource "aws_iam_role" "signature_lambda_role" {
  name = "replyio-signature-automation-role"

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
    Purpose     = "Reply.io signature automation with Puppeteer"
  }
}

resource "aws_iam_role_policy" "signature_lambda_policy" {
  name = "replyio-signature-automation-policy"
  role = aws_iam_role.signature_lambda_role.id

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
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:n8n/clients/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.clients.arn
      }
    ]
  })
}

# ============================================================
# Signature Lambda Deployment Package
# ============================================================

data "archive_file" "signature_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../signature-lambda"
  output_path = "${path.module}/signature-lambda-package.zip"
  excludes    = ["function.zip"]
}

resource "aws_s3_object" "signature_lambda_package" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "replyio-signature-automation/${var.environment}/function-${data.archive_file.signature_lambda_zip.output_base64sha256}.zip"
  source = data.archive_file.signature_lambda_zip.output_path
  etag   = filemd5(data.archive_file.signature_lambda_zip.output_path)

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============================================================
# Signature Lambda Function
# ============================================================

resource "aws_lambda_function" "signature_automation" {
  function_name = "replyio-signature-automation"
  role          = aws_iam_role.signature_lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 900
  memory_size   = 3008

  s3_bucket        = aws_s3_bucket.lambda_deployments.id
  s3_key           = aws_s3_object.signature_lambda_package.key
  source_code_hash = data.archive_file.signature_lambda_zip.output_base64sha256

  # Ephemeral storage for Puppeteer/Chromium
  ephemeral_storage {
    size = 2048
  }

  environment {
    variables = {
      NODE_ENV       = var.environment
      DYNAMODB_TABLE = aws_dynamodb_table.clients.name
    }
  }

  layers = [
    var.chrome_lambda_layer_arn
  ]

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Reply.io signature automation with Puppeteer"
    ManagedBy   = "Terraform"
  }
}

resource "aws_cloudwatch_log_group" "signature_lambda_logs" {
  name              = "/aws/lambda/replyio-signature-automation"
  retention_in_days = 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda Function URL for direct invocation from n8n
resource "aws_lambda_function_url" "signature_automation" {
  function_name      = aws_lambda_function.signature_automation.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["POST"]
    allow_headers     = ["content-type"]
    max_age           = 86400
  }
}
