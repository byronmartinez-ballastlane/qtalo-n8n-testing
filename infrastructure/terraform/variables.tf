
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "qtalo"
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


variable "n8n_api_url" {
  description = "n8n API base URL (without /api/v1)"
  type        = string
  default     = "https://qtalospace.app.n8n.cloud"
}

variable "n8n_jwt_credential_name" {
  description = "n8n credential name for the JWT secret"
  type        = string
  default     = "AWS API Gateway JWT"
}


variable "import_mode" {
  description = "Set to true when importing existing infrastructure"
  type        = bool
  default     = false
}


variable "github_pat" {
  description = "GitHub Personal Access Token (for creating repo secrets)"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "qtalo-n8n-testing"
}
