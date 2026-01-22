variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use (e.g., 'bla' for BallastLane, 'qtalo' for Qtalo client)"
  type        = string
  default     = "bla"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "qtalo-n8n"
}

# ============================================================
# Lambda Layer Configuration
# ============================================================

variable "chrome_lambda_layer_arn" {
  description = "ARN of the chrome-aws-lambda layer for Puppeteer support"
  type        = string
  default     = "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:45"
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name for client configs"
  type        = string
  default     = "qtalo-n8n-clients"
}

# ============================================================
# n8n API Configuration (for JWT secret rotation)
# ============================================================

variable "n8n_api_url" {
  description = "n8n API base URL (without /api/v1)"
  type        = string
  default     = "https://qtalospace.app.n8n.cloud"
}

variable "n8n_jwt_credential_name" {
  description = "n8n credential name for the JWT secret (webhook finds by name)"
  type        = string
  default     = "AWS API Gateway JWT"
}

# ============================================================
# Import Mode Configuration
# ============================================================
# When importing existing infrastructure (BLA account), set to true.
# The HTTP API integration/route/stage were created via "quick create"
# and cannot be imported. Setting this to true skips creating them.
# For fresh deployments (Qtalo account), set to false to create all resources.

variable "import_mode" {
  description = "Set to true when importing existing infrastructure (skips quick-create resources)"
  type        = bool
  default     = false
}
