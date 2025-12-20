# ============================================================
# Outputs
# ============================================================

output "api_gateway_url" {
  description = "Base URL for the API Gateway"
  value       = "${aws_api_gateway_stage.api.invoke_url}"
}

output "api_gateway_id" {
  description = "API Gateway REST API ID"
  value       = aws_api_gateway_rest_api.api.id
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.client_manager.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.client_manager.function_name
}

output "lambda_role_arn" {
  description = "ARN of the Lambda IAM role"
  value       = aws_iam_role.lambda_role.arn
}

# Endpoint URLs for n8n integration
output "endpoints" {
  description = "API endpoints for n8n workflows"
  value = {
    health      = "${aws_api_gateway_stage.api.invoke_url}/health"
    list_clients = "${aws_api_gateway_stage.api.invoke_url}/clients"
    get_client  = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    create_client = "${aws_api_gateway_stage.api.invoke_url}/clients"
    update_client = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    delete_client = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    get_credentials = "${aws_api_gateway_stage.api.invoke_url}/credentials/{clientId}"
    update_workflows = "${aws_api_gateway_stage.api.invoke_url}/workflows"
    sync_clients = "${aws_api_gateway_stage.api.invoke_url}/sync"
  }
}
