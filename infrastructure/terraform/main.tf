# Qtalo n8n Multi-Tenant Infrastructure
# Terraform configuration for Lambda + API Gateway

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

provider "github" {
  token = var.github_pat
  owner = "byronmartinez-ballastlane"
}
