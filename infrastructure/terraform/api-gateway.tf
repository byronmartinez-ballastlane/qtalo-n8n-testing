# ============================================================
# API Gateway REST API
# ============================================================

resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.project_name}-api-${var.environment}"
  description = "API for managing n8n multi-tenant clients"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# ============================================================
# /health endpoint
# ============================================================

resource "aws_api_gateway_resource" "health" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "health"
}

resource "aws_api_gateway_method" "health_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.health.id
  http_method             = aws_api_gateway_method.health_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# ============================================================
# /clients endpoint
# ============================================================

resource "aws_api_gateway_resource" "clients" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "clients"
}

# GET /clients - List all clients
resource "aws_api_gateway_method" "clients_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.clients.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "clients_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.clients.id
  http_method             = aws_api_gateway_method.clients_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# POST /clients - Create new client
resource "aws_api_gateway_method" "clients_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.clients.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "clients_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.clients.id
  http_method             = aws_api_gateway_method.clients_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# OPTIONS /clients - CORS
resource "aws_api_gateway_method" "clients_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.clients.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "clients_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.clients.id
  http_method = aws_api_gateway_method.clients_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "clients_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.clients.id
  http_method = aws_api_gateway_method.clients_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "clients_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.clients.id
  http_method = aws_api_gateway_method.clients_options.http_method
  status_code = aws_api_gateway_method_response.clients_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ============================================================
# /clients/{clientId} endpoint
# ============================================================

resource "aws_api_gateway_resource" "client_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.clients.id
  path_part   = "{clientId}"
}

# GET /clients/{clientId}
resource "aws_api_gateway_method" "client_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.client_id.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.clientId" = true
  }
}

resource "aws_api_gateway_integration" "client_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.client_id.id
  http_method             = aws_api_gateway_method.client_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# PUT /clients/{clientId}
resource "aws_api_gateway_method" "client_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.client_id.id
  http_method   = "PUT"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.clientId" = true
  }
}

resource "aws_api_gateway_integration" "client_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.client_id.id
  http_method             = aws_api_gateway_method.client_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# DELETE /clients/{clientId}
resource "aws_api_gateway_method" "client_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.client_id.id
  http_method   = "DELETE"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.clientId" = true
  }
}

resource "aws_api_gateway_integration" "client_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.client_id.id
  http_method             = aws_api_gateway_method.client_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# ============================================================
# /clients/claim/{taskId} endpoint - Claim a task to prevent race conditions
# ============================================================

resource "aws_api_gateway_resource" "claim" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.clients.id
  path_part   = "claim"
}

resource "aws_api_gateway_resource" "claim_task_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.claim.id
  path_part   = "{taskId}"
}

# PUT /clients/claim/{taskId}
resource "aws_api_gateway_method" "claim_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.claim_task_id.id
  http_method   = "PUT"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.taskId" = true
  }
}

resource "aws_api_gateway_integration" "claim_put" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.claim_task_id.id
  http_method             = aws_api_gateway_method.claim_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# OPTIONS /clients/claim/{taskId} - CORS
resource "aws_api_gateway_method" "claim_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.claim_task_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "claim_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.claim_task_id.id
  http_method = aws_api_gateway_method.claim_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "claim_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.claim_task_id.id
  http_method = aws_api_gateway_method.claim_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "claim_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.claim_task_id.id
  http_method = aws_api_gateway_method.claim_options.http_method
  status_code = aws_api_gateway_method_response.claim_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ============================================================
# /clients/by-task/{taskId} endpoint - Lookup by ClickUp task
# ============================================================

resource "aws_api_gateway_resource" "by_task" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.clients.id
  path_part   = "by-task"
}

resource "aws_api_gateway_resource" "by_task_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.by_task.id
  path_part   = "{taskId}"
}

# GET /clients/by-task/{taskId}
resource "aws_api_gateway_method" "by_task_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.by_task_id.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.taskId" = true
  }
}

resource "aws_api_gateway_integration" "by_task_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.by_task_id.id
  http_method             = aws_api_gateway_method.by_task_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# OPTIONS /clients/by-task/{taskId} - CORS
resource "aws_api_gateway_method" "by_task_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.by_task_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "by_task_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.by_task_id.id
  http_method = aws_api_gateway_method.by_task_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "by_task_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.by_task_id.id
  http_method = aws_api_gateway_method.by_task_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "by_task_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.by_task_id.id
  http_method = aws_api_gateway_method.by_task_options.http_method
  status_code = aws_api_gateway_method_response.by_task_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ============================================================
# /credentials/{clientId} endpoint
# ============================================================

resource "aws_api_gateway_resource" "credentials" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "credentials"
}

resource "aws_api_gateway_resource" "credentials_client_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.credentials.id
  path_part   = "{clientId}"
}

resource "aws_api_gateway_method" "credentials_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.credentials_client_id.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.clientId" = true
  }
}

resource "aws_api_gateway_integration" "credentials_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.credentials_client_id.id
  http_method             = aws_api_gateway_method.credentials_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# PUT /credentials/{clientId} - Update credentials
resource "aws_api_gateway_method" "credentials_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.credentials_client_id.id
  http_method   = "PUT"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.clientId" = true
  }
}

resource "aws_api_gateway_integration" "credentials_put" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.credentials_client_id.id
  http_method             = aws_api_gateway_method.credentials_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# OPTIONS /credentials/{clientId} - CORS
resource "aws_api_gateway_method" "credentials_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.credentials_client_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "credentials_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.credentials_client_id.id
  http_method = aws_api_gateway_method.credentials_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "credentials_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.credentials_client_id.id
  http_method = aws_api_gateway_method.credentials_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "credentials_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.credentials_client_id.id
  http_method = aws_api_gateway_method.credentials_options.http_method
  status_code = aws_api_gateway_method_response.credentials_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,PUT,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ============================================================
# /workflows endpoint
# ============================================================

resource "aws_api_gateway_resource" "workflows" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "workflows"
}

resource "aws_api_gateway_method" "workflows_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.workflows.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "workflows_put" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.workflows.id
  http_method             = aws_api_gateway_method.workflows_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# ============================================================
# /sync endpoint
# ============================================================

resource "aws_api_gateway_resource" "sync" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "sync"
}

resource "aws_api_gateway_method" "sync_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.sync.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "sync_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.sync.id
  http_method             = aws_api_gateway_method.sync_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.client_manager.invoke_arn
}

# ============================================================
# Lambda Permission for API Gateway
# ============================================================

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.client_manager.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ============================================================
# API Gateway Deployment
# ============================================================

resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  # Explicit dependencies on all integrations
  depends_on = [
    aws_api_gateway_integration.health_get,
    aws_api_gateway_integration.clients_get,
    aws_api_gateway_integration.clients_post,
    aws_api_gateway_integration.clients_options,
    aws_api_gateway_integration.client_id_get,
    aws_api_gateway_integration.client_id_put,
    aws_api_gateway_integration.client_id_delete,
    aws_api_gateway_integration.by_task_get,
    aws_api_gateway_integration.by_task_options,
    aws_api_gateway_integration.credentials_get,
    aws_api_gateway_integration.credentials_put,
    aws_api_gateway_integration.credentials_options,
    aws_api_gateway_integration.workflows_put,
    aws_api_gateway_integration.sync_post,
  ]

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.health.id,
      aws_api_gateway_resource.clients.id,
      aws_api_gateway_resource.client_id.id,
      aws_api_gateway_resource.by_task.id,
      aws_api_gateway_resource.by_task_id.id,
      aws_api_gateway_resource.credentials.id,
      aws_api_gateway_resource.workflows.id,
      aws_api_gateway_resource.sync.id,
      aws_api_gateway_method.health_get.id,
      aws_api_gateway_method.clients_get.id,
      aws_api_gateway_method.clients_post.id,
      aws_api_gateway_method.client_id_get.id,
      aws_api_gateway_method.client_id_put.id,
      aws_api_gateway_method.client_id_delete.id,
      aws_api_gateway_method.by_task_get.id,
      aws_api_gateway_method.by_task_options.id,
      aws_api_gateway_method.credentials_get.id,
      aws_api_gateway_method.credentials_put.id,
      aws_api_gateway_method.workflows_put.id,
      aws_api_gateway_method.sync_post.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "api" {
  deployment_id = aws_api_gateway_deployment.api.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = var.environment

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
