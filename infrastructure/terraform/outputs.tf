
output "api_gateway_url" {
  description = "Base URL for the API Gateway"
  value       = aws_api_gateway_stage.api.invoke_url
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

output "endpoints" {
  description = "API endpoints for n8n workflows"
  value = {
    health           = "${aws_api_gateway_stage.api.invoke_url}/health"
    list_clients     = "${aws_api_gateway_stage.api.invoke_url}/clients"
    get_client       = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    get_by_task      = "${aws_api_gateway_stage.api.invoke_url}/clients/by-task/{taskId}"
    create_client    = "${aws_api_gateway_stage.api.invoke_url}/clients"
    update_client    = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    delete_client    = "${aws_api_gateway_stage.api.invoke_url}/clients/{clientId}"
    get_credentials  = "${aws_api_gateway_stage.api.invoke_url}/credentials/{clientId}"
    update_workflows = "${aws_api_gateway_stage.api.invoke_url}/workflows"
    sync_clients     = "${aws_api_gateway_stage.api.invoke_url}/sync"
  }
}

output "s3_bucket_name" {
  description = "S3 bucket for Lambda deployments"
  value       = aws_s3_bucket.lambda_deployments.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for Lambda deployments"
  value       = aws_s3_bucket.lambda_deployments.arn
}


output "signature_lambda_arn" {
  description = "ARN of the Reply.io Signature Automation Lambda"
  value       = aws_lambda_function.signature_automation.arn
}

output "signature_lambda_function_url" {
  description = "Function URL for direct Lambda invocation from n8n"
  value       = aws_lambda_function_url.signature_automation.function_url
}

output "signature_lambda_role_arn" {
  description = "ARN of the Signature Lambda IAM role"
  value       = aws_iam_role.signature_lambda_role.arn
}
