/**
 * JWT Authorizer Lambda for API Gateway
 * 
 * Validates JWT tokens from the Authorization header.
 * Fetches the signing secret from AWS Secrets Manager.
 * Caches the secret for 5 minutes to reduce API calls.
 */

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const crypto = require("crypto");

const secretsClient = new SecretsManagerClient({});

// Cache for the JWT secret
let cachedSecret = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getJwtSecret() {
  const now = Date.now();

  if (cachedSecret && now < cacheExpiry) {
    console.log("Using cached JWT secret");
    return cachedSecret;
  }

  console.log("Fetching JWT secret from Secrets Manager");
  const secretName = process.env.JWT_SECRET_NAME;

  if (!secretName) {
    throw new Error("JWT_SECRET_NAME environment variable not set");
  }

  const command = new GetSecretValueCommand({
    SecretId: secretName,
  });

  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }

  const secretData = JSON.parse(response.SecretString);
  cachedSecret = secretData.secret;
  cacheExpiry = now + CACHE_TTL_MS;

  console.log("JWT secret fetched and cached");
  return cachedSecret;
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }

  return Buffer.from(base64, "base64");
}

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function verifyJwt(token, secret) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: expected 3 parts");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));

  if (header.alg !== "HS256") {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  const signatureInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(signatureInput).digest()
  );

  const actualSignature = signatureB64;

  if (expectedSignature.length !== actualSignature.length) {
    throw new Error("Invalid signature");
  }

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(actualSignature);

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid signature");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }

  if (payload.nbf && payload.nbf > now) {
    throw new Error("Token not yet valid");
  }

  return payload;
}

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const policy = {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (Object.keys(context).length > 0) {
    policy.context = context;
  }

  return policy;
}

function extractToken(authHeader) {
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return authHeader;
}

exports.handler = async (event) => {
  console.log("JWT Authorizer invoked");
  console.log("Event type:", event.type);
  console.log("Method ARN:", event.methodArn);

  try {
    const token = extractToken(event.authorizationToken);
    const secret = await getJwtSecret();
    const payload = verifyJwt(token, secret);

    console.log("JWT verified successfully");
    console.log("Token claims:", JSON.stringify(payload, null, 2));
    const context = {};
    if (payload.workflowId) context.workflowId = String(payload.workflowId);
    if (payload.executionId) context.executionId = String(payload.executionId);
    if (payload.sub) context.sub = String(payload.sub);
    if (payload.iat) context.iat = payload.iat;
    if (payload.exp) context.exp = payload.exp;

    return generatePolicy("n8n-workflow", "Allow", event.methodArn, context);
  } catch (error) {
    console.error("Authorization failed:", error.message);
    return generatePolicy("unauthorized", "Deny", event.methodArn);
  }
};
