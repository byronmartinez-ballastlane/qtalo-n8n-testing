terraform {
  backend "s3" {
    bucket  = "qtalo-n8n-terraform-state"
    key     = "n8n-multi-tenant/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
    profile = "qtalo"
  }
}