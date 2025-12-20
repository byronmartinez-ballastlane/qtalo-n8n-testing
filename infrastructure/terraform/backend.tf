# Backend configuration
# Using local backend for simplicity
# To use S3 backend, uncomment below and run: terraform init -migrate-state

# terraform {
#   backend "s3" {
#     bucket         = "qtalo-terraform-state"
#     key            = "n8n-multi-tenant/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "terraform-lock"
#     encrypt        = true
#     profile        = "bla"
#   }
# }
