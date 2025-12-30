variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
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

variable "n8n_api_key" {
  description = "n8n API key for credential management"
  type        = string
  sensitive   = true
  default     = ""  # Set via TF_VAR_n8n_api_key or terraform.tfvars
}

variable "n8n_jwt_credential_id" {
  description = "n8n credential ID for the JWT secret"
  type        = string
  default     = ""  # Set after creating the credential in n8n
}
