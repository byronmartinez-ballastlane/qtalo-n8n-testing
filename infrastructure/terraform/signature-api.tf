# ============================================================
# HTTP API (API Gateway v2) for Signature Automation
# ============================================================
# This creates an HTTP API that proxies requests to the
# replyio-signature-automation Lambda function.
# The endpoint is: https://{api-id}.execute-api.{region}.amazonaws.com
# 
# Note: In BLA account, this was created via "quick create" so
# integration/route/stage are AWS-managed. In Qtalo account,
# Terraform will create everything.
# ============================================================

resource "aws_apigatewayv2_api" "signature_api" {
  name          = "replyio-signature-automation-api"
  protocol_type = "HTTP"

  # Only add CORS and tags for new deployments (qtalo)
  # BLA account has no CORS/tags configured
  dynamic "cors_configuration" {
    for_each = var.aws_profile == "bla" ? [] : [1]
    content {
      allow_credentials = false
      allow_headers     = ["content-type", "authorization"]
      allow_methods     = ["POST", "OPTIONS"]
      allow_origins     = ["*"]
      max_age           = 86400
    }
  }

  tags = var.aws_profile == "bla" ? {} : {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Reply.io signature automation"
    ManagedBy   = "Terraform"
  }
}

# Integration with Lambda
# Skip in BLA account - already exists via quick create
resource "aws_apigatewayv2_integration" "signature_lambda" {
  count = var.aws_profile == "bla" ? 0 : 1

  api_id                 = aws_apigatewayv2_api.signature_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.signature_automation.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

# Default route - catches all requests
# Skip in BLA account - already exists via quick create
resource "aws_apigatewayv2_route" "signature_default" {
  count = var.aws_profile == "bla" ? 0 : 1

  api_id    = aws_apigatewayv2_api.signature_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.signature_lambda[0].id}"
}

# Auto-deploy stage
# Skip in BLA account - already exists via quick create
resource "aws_apigatewayv2_stage" "signature_default" {
  count = var.aws_profile == "bla" ? 0 : 1

  api_id      = aws_apigatewayv2_api.signature_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = false
    throttling_burst_limit   = 5000
    throttling_rate_limit    = 10000
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda permission for API Gateway v2 to invoke the function
# Skip in BLA account - already exists
resource "aws_lambda_permission" "signature_api_gateway" {
  count = var.aws_profile == "bla" ? 0 : 1

  statement_id  = "AllowAPIGatewayV2Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.signature_automation.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.signature_api.execution_arn}/*/*"
}

# ============================================================
# Outputs
# ============================================================

output "signature_api_endpoint" {
  description = "HTTP API endpoint for signature automation"
  value       = aws_apigatewayv2_api.signature_api.api_endpoint
}

output "signature_api_id" {
  description = "HTTP API ID"
  value       = aws_apigatewayv2_api.signature_api.id
}
