# ============================================================
# BallastLane AWS Account Configuration (Original/Dev)
# ============================================================
# Use this file when deploying to the BallastLane AWS account:
#   terraform plan -var-file="bla.tfvars"
#   terraform apply -var-file="bla.tfvars"
# ============================================================

aws_profile  = "bla"
aws_region   = "us-east-1"
environment  = "prod"
project_name = "qtalo-n8n"

# n8n Configuration
n8n_api_url             = "https://qtalospace.app.n8n.cloud"
n8n_jwt_credential_name = "AWS API Gateway JWT"

# Chrome Lambda Layer (public layer - same in all accounts)
chrome_lambda_layer_arn = "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:45"
