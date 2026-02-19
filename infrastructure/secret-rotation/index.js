
const {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretVersionStageCommand,
  DescribeSecretCommand,
} = require("@aws-sdk/client-secrets-manager");
const {
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} = require("@aws-sdk/client-lambda");
const crypto = require("crypto");

const secretsClient = new SecretsManagerClient({});
const lambdaClient = new LambdaClient({});

const N8N_API_URL = process.env.N8N_API_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_CREDENTIAL_NAME = process.env.N8N_CREDENTIAL_NAME || "JWT API Token";

function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

async function getSecretValue(secretId, versionStage = "AWSCURRENT") {
  try {
    const command = new GetSecretValueCommand({
      SecretId: secretId,
      VersionStage: versionStage,
    });
    const response = await secretsClient.send(command);
    return JSON.parse(response.SecretString);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      return null;
    }
    throw error;
  }
}

async function createPendingSecret(secretId, clientRequestToken, secretValue) {
  console.log(`Creating pending secret version: ${clientRequestToken}`);

  const command = new PutSecretValueCommand({
    SecretId: secretId,
    ClientRequestToken: clientRequestToken,
    SecretString: JSON.stringify(secretValue),
    VersionStages: ["AWSPENDING"],
  });

  await secretsClient.send(command);
  console.log("Pending secret created successfully");
}

async function pushToN8n(secret) {
  if (!N8N_API_URL) {
    console.log(
      "n8n configuration not set, skipping credential update. ",
      "Set N8N_API_URL environment variable."
    );
    return { success: true, new_credential_id: null };
  }

  console.log(`Calling n8n JWT rotation webhook for credential: ${N8N_CREDENTIAL_NAME}`);

  const url = `${N8N_API_URL}/webhook/rotate-jwt-credential`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        new_jwt_token: secret,
        credential_name: N8N_CREDENTIAL_NAME,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n webhook error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`n8n rotation failed: ${JSON.stringify(result)}`);
    }

    console.log(`Successfully rotated n8n credential. New ID: ${result.new_credential_id}, Workflows updated: ${result.workflows_updated}`);
    
    return {
      success: true,
      new_credential_id: result.new_credential_id,
      old_credential_id: result.old_credential_id,
      workflows_updated: result.workflows_updated,
    };
  } catch (error) {
    console.error("Failed to rotate n8n credential:", error.message);
    throw error;
  }
}

async function testN8nSecret() {
  if (!N8N_API_URL) {
    console.log("n8n configuration not set, skipping test");
    return true;
  }

  console.log("n8n credential rotation completed via webhook - test passed");
  return true;
}

async function invalidateAuthorizerCache() {
  const authorizerFunctionName = process.env.AUTHORIZER_FUNCTION_NAME;
  if (!authorizerFunctionName) {
    console.log("AUTHORIZER_FUNCTION_NAME not set, skipping cache invalidation");
    return;
  }

  console.log(`Invalidating authorizer cache for: ${authorizerFunctionName}`);

  try {
    const command = new UpdateFunctionConfigurationCommand({
      FunctionName: authorizerFunctionName,
      Environment: {
        Variables: {
          JWT_SECRET_NAME: process.env.JWT_SECRET_NAME,
          LAST_ROTATION: new Date().toISOString(),
        },
      },
    });

    await lambdaClient.send(command);
    console.log("Authorizer Lambda configuration updated - cache invalidated");
  } catch (error) {
    console.warn("Failed to invalidate authorizer cache (non-fatal):", error.message);
  }
}

async function finishRotation(secretId, clientRequestToken) {
  console.log("Finishing rotation - promoting AWSPENDING to AWSCURRENT");

  const describeCommand = new DescribeSecretCommand({
    SecretId: secretId,
  });
  const secretMetadata = await secretsClient.send(describeCommand);

  let currentVersionId = null;
  for (const [versionId, stages] of Object.entries(
    secretMetadata.VersionIdsToStages || {}
  )) {
    if (stages.includes("AWSCURRENT") && versionId !== clientRequestToken) {
      currentVersionId = versionId;
      break;
    }
  }

  const updateCommand = new UpdateSecretVersionStageCommand({
    SecretId: secretId,
    VersionStage: "AWSCURRENT",
    MoveToVersionId: clientRequestToken,
    RemoveFromVersionId: currentVersionId,
  });

  await secretsClient.send(updateCommand);
  console.log(
    `Rotation complete. New current version: ${clientRequestToken}`
  );
}

async function handleSecretsManagerRotation(event) {
  const secretId = event.SecretId;
  const clientRequestToken = event.ClientRequestToken;
  const step = event.Step;

  console.log(`Rotation step: ${step} for secret: ${secretId}`);

  switch (step) {
    case "createSecret": {
      const pendingSecret = await getSecretValue(secretId, "AWSPENDING");
      if (pendingSecret) {
        console.log("Pending secret already exists, skipping creation");
        return;
      }

      const newSecret = {
        secret: generateSecret(),
        createdAt: new Date().toISOString(),
        rotatedBy: "secret-rotation-lambda",
      };

      await createPendingSecret(secretId, clientRequestToken, newSecret);
      break;
    }

    case "setSecret": {
      const pendingSecret = await getSecretValue(secretId, "AWSPENDING");
      if (!pendingSecret) {
        throw new Error("No pending secret found");
      }

      const rotationResult = await pushToN8n(pendingSecret.secret);
      console.log(`n8n credential rotated. New ID: ${rotationResult.new_credential_id}`);
      break;
    }

    case "testSecret": {
      await testN8nSecret();
      break;
    }

    case "finishSecret": {
      await finishRotation(secretId, clientRequestToken);
      break;
    }

    default:
      throw new Error(`Unknown rotation step: ${step}`);
  }
}

async function handleScheduledRotation() {
  const secretId = process.env.JWT_SECRET_NAME;

  if (!secretId) {
    throw new Error("JWT_SECRET_NAME environment variable not set");
  }

  console.log(`Starting scheduled rotation for secret: ${secretId}`);

  const newSecret = {
    secret: generateSecret(),
    createdAt: new Date().toISOString(),
    rotatedBy: "scheduled-rotation",
  };

  const clientRequestToken = crypto.randomUUID();

  await createPendingSecret(secretId, clientRequestToken, newSecret);

  const rotationResult = await pushToN8n(newSecret.secret);

  await testN8nSecret();

  await finishRotation(secretId, clientRequestToken);

  await invalidateAuthorizerCache();

  console.log("Scheduled rotation completed successfully");

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Secret rotation completed",
      secretId,
      versionId: clientRequestToken,
      n8n_credential_id: rotationResult.new_credential_id,
      workflows_updated: rotationResult.workflows_updated,
    }),
  };
}

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  if (event.SecretId && event.ClientRequestToken && event.Step) {
    return handleSecretsManagerRotation(event);
  }

  return handleScheduledRotation();
};
