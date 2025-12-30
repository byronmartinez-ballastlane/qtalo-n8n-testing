/**
 * JWT Secret Rotation Lambda
 *
 * This Lambda rotates the JWT signing secret every 6 hours via EventBridge.
 * It generates a new 32-byte secret and pushes it to n8n credentials API.
 *
 * The rotation follows AWS Secrets Manager rotation pattern:
 * 1. createSecret - Generate and store new secret as AWSPENDING
 * 2. setSecret - Push new secret to n8n credentials
 * 3. testSecret - Verify n8n can use the new secret
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
const N8N_CREDENTIAL_ID = process.env.N8N_CREDENTIAL_ID;

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
 * Push the secret to n8n credentials API
 */
async function pushToN8n(secret) {
  if (!N8N_API_URL || !N8N_API_KEY || !N8N_CREDENTIAL_ID) {
    console.log(
      "n8n configuration not set, skipping credential update. ",
      "Set N8N_API_URL, N8N_API_KEY, and N8N_CREDENTIAL_ID environment variables."
    );
    return true;
  }

  console.log(`Pushing secret to n8n credential: ${N8N_CREDENTIAL_ID}`);

  const url = `${N8N_API_URL}/api/v1/credentials/${N8N_CREDENTIAL_ID}`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": N8N_API_KEY,
      },
      body: JSON.stringify({
        data: {
          secret: secret,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Successfully updated n8n credential");
    return true;
  } catch (error) {
    console.error("Failed to push secret to n8n:", error.message);
    throw error;
  }
}

/**
 * Test that n8n can use the new secret
 * For now, we just verify the credential exists
 */
async function testN8nSecret() {
  if (!N8N_API_URL || !N8N_API_KEY || !N8N_CREDENTIAL_ID) {
    console.log("n8n configuration not set, skipping test");
    return true;
  }

  console.log("Testing n8n credential access");

  const url = `${N8N_API_URL}/api/v1/credentials/${N8N_CREDENTIAL_ID}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-N8N-API-KEY": N8N_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`n8n API error: ${response.status}`);
    }

    console.log("n8n credential test passed");
    return true;
  } catch (error) {
    console.error("n8n credential test failed:", error.message);
    throw error;
  }
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
      // Get the pending secret and push to n8n
      const pendingSecret = await getSecretValue(secretId, "AWSPENDING");
      if (!pendingSecret) {
        throw new Error("No pending secret found");
      }

      await pushToN8n(pendingSecret.secret);
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

  // Step 2: Push to n8n
  await pushToN8n(newSecret.secret);

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
