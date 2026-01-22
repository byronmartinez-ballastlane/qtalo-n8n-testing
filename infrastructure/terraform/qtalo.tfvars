# ============================================================
# Qtalo Client AWS Account Configuration
# ============================================================
# Use this file when deploying to the Qtalo client's AWS account:
#   terraform plan -var-file="qtalo.tfvars"
#   terraform apply -var-file="qtalo.tfvars"
# ============================================================

aws_profile  = "qtalo"
aws_region   = "us-east-1"
environment  = "prod"
project_name = "qtalo-n8n"

# n8n Configuration
n8n_api_url             = "https://qtalospace.app.n8n.cloud"
n8n_jwt_credential_name = "AWS API Gateway JWT"

# Chrome Lambda Layer (public layer - same in all accounts)
chrome_lambda_layer_arn = "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:45"
