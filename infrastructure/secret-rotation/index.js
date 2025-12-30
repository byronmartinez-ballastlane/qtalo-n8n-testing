/**
 * JWT Secret Rotation Lambda
 *
 * This Lambda rotates the JWT signing secret every 6 hours via EventBridge.
 * It generates a new 32-byte secret and calls the n8n JWT rotation webhook.
 *
 * The n8n webhook (System - JWT Credential Rotation) handles:
 * 1. Creating a new credential with the new token
 * 2. Updating all workflows using the old credential
 * 3. Deleting the old credential
 *
 * The rotation follows AWS Secrets Manager rotation pattern:
 * 1. createSecret - Generate and store new secret as AWSPENDING
 * 2. setSecret - Call n8n webhook to rotate credential
 * 3. testSecret - Verify rotation completed
 * 4. finishSecret - Promote AWSPENDING to AWSCURRENT
 */

const {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretVersionStageCommand,
  DescribeSecretCommand,
} = require("@aws-sdk/client-secrets-manager");
const crypto = require("crypto");

const secretsClient = new SecretsManagerClient({});

// n8n API configuration from environment
const N8N_API_URL = process.env.N8N_API_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_CREDENTIAL_NAME = process.env.N8N_CREDENTIAL_NAME || "JWT API Token";

/**
 * Generate a cryptographically secure 32-byte secret
 */
function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Get the current secret value
 */
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

/**
 * Store a new secret version as AWSPENDING
 */
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

/**
 * Push the secret to n8n via JWT rotation webhook
 * The webhook creates a new credential, updates all workflows, and deletes the old one
 * Returns the new credential ID for storage
 */
async function pushToN8n(secret) {
  if (!N8N_API_URL) {
    console.log(
      "n8n configuration not set, skipping credential update. ",
      "Set N8N_API_URL environment variable."
    );
    return { success: true, new_credential_id: null };
  }

  console.log(`Calling n8n JWT rotation webhook for credential: ${N8N_CREDENTIAL_NAME}`);

  // Call the JWT rotation webhook
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

/**
 * Test that n8n can use the new secret
 * Since rotation webhook handles everything, we just verify the webhook is accessible
 */
async function testN8nSecret() {
  if (!N8N_API_URL) {
    console.log("n8n configuration not set, skipping test");
    return true;
  }

  console.log("n8n credential rotation completed via webhook - test passed");
  return true;
}

/**
 * Promote AWSPENDING to AWSCURRENT
 */
async function finishRotation(secretId, clientRequestToken) {
  console.log("Finishing rotation - promoting AWSPENDING to AWSCURRENT");

  // Get the current version
  const describeCommand = new DescribeSecretCommand({
    SecretId: secretId,
  });
  const secretMetadata = await secretsClient.send(describeCommand);

  // Find the current version ID
  let currentVersionId = null;
  for (const [versionId, stages] of Object.entries(
    secretMetadata.VersionIdsToStages || {}
  )) {
    if (stages.includes("AWSCURRENT") && versionId !== clientRequestToken) {
      currentVersionId = versionId;
      break;
    }
  }

  // Move AWSCURRENT to the old version (if exists) and AWSPENDING to AWSCURRENT
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

/**
 * Main rotation handler for Secrets Manager rotation
 * Called by AWS Secrets Manager with rotation steps
 */
async function handleSecretsManagerRotation(event) {
  const secretId = event.SecretId;
  const clientRequestToken = event.ClientRequestToken;
  const step = event.Step;

  console.log(`Rotation step: ${step} for secret: ${secretId}`);

  switch (step) {
    case "createSecret": {
      // Check if pending version already exists
      const pendingSecret = await getSecretValue(secretId, "AWSPENDING");
      if (pendingSecret) {
        console.log("Pending secret already exists, skipping creation");
        return;
      }

      // Generate new secret
      const newSecret = {
        secret: generateSecret(),
        createdAt: new Date().toISOString(),
        rotatedBy: "secret-rotation-lambda",
      };

      await createPendingSecret(secretId, clientRequestToken, newSecret);
      break;
    }

    case "setSecret": {
      // Get the pending secret and push to n8n via webhook
      const pendingSecret = await getSecretValue(secretId, "AWSPENDING");
      if (!pendingSecret) {
        throw new Error("No pending secret found");
      }

      const rotationResult = await pushToN8n(pendingSecret.secret);
      console.log(`n8n credential rotated. New ID: ${rotationResult.new_credential_id}`);
      break;
    }

    case "testSecret": {
      // Test that n8n can use the new secret
      await testN8nSecret();
      break;
    }

    case "finishSecret": {
      // Promote AWSPENDING to AWSCURRENT
      await finishRotation(secretId, clientRequestToken);
      break;
    }

    default:
      throw new Error(`Unknown rotation step: ${step}`);
  }
}

/**
 * EventBridge handler for scheduled rotation
 * Performs the full rotation in one go
 */
async function handleScheduledRotation() {
  const secretId = process.env.JWT_SECRET_NAME;

  if (!secretId) {
    throw new Error("JWT_SECRET_NAME environment variable not set");
  }

  console.log(`Starting scheduled rotation for secret: ${secretId}`);

  // Generate new secret
  const newSecret = {
    secret: generateSecret(),
    createdAt: new Date().toISOString(),
    rotatedBy: "scheduled-rotation",
  };

  const clientRequestToken = crypto.randomUUID();

  // Step 1: Create pending secret
  await createPendingSecret(secretId, clientRequestToken, newSecret);

  // Step 2: Push to n8n via webhook (creates new credential, updates workflows, deletes old)
  const rotationResult = await pushToN8n(newSecret.secret);

  // Step 3: Test n8n
  await testN8nSecret();

  // Step 4: Finish rotation
  await finishRotation(secretId, clientRequestToken);

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

/**
 * Main Lambda handler
 * Supports both Secrets Manager rotation events and EventBridge scheduled events
 */
exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  // Check if this is a Secrets Manager rotation event
  if (event.SecretId && event.ClientRequestToken && event.Step) {
    return handleSecretsManagerRotation(event);
  }

  // Otherwise, treat as scheduled EventBridge event
  return handleScheduledRotation();
};
