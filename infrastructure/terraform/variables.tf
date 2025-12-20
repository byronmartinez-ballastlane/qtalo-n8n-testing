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
