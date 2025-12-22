const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const https = require('https');
const http = require('http');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const REGION = process.env.AWS_REGION || 'us-east-1';
const secretsClient = new SecretsManagerClient({ region: REGION });

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch client credentials from AWS Secrets Manager
async function getClientCredentials(clientId) {
  const secretName = `n8n/clients/${clientId}`;
  
  try {
    console.log(`Fetching credentials from Secrets Manager: ${secretName}`);
    const result = await secretsClient.send(new GetSecretValueCommand({
      SecretId: secretName
    }));
    
    const credentials = JSON.parse(result.SecretString);
    console.log(`✅ Retrieved credentials for client: ${clientId}`);
    
    return {
      replyioEmail: credentials.reply_io_user,
      replyioPassword: credentials.reply_io_password
    };
  } catch (error) {
    console.error(`❌ Failed to fetch credentials for client ${clientId}:`, error.message);
    throw new Error(`Failed to fetch credentials for client: ${clientId}. Error: ${error.message}`);
  }
}

// Helper to send webhook notification via GET with query parameters
async function sendWebhook(webhookUrl, data) {
  if (!webhookUrl) {
    console.log('No webhook URL provided, skipping notification');
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      // Encode data as query parameters
      const params = new URLSearchParams({
        status: data.status,
        timestamp: data.timestamp,
        result: JSON.stringify(data.result || data.error || {})
      });
      
      const url = new URL(webhookUrl);
      // Append encoded data to URL query string
      url.search = params.toString();
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      };

      console.log(`Sending GET request to webhook: ${url.href.substring(0, 100)}...`);
      
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        console.log(`Webhook response status: ${res.statusCode}`);
        resolve();
      });

      req.on('error', (error) => {
        console.error('Webhook error:', error);
        reject(error);
      });

      req.end();
    } catch (error) {
      console.error('Error constructing webhook URL:', error);
      reject(error);
    }
  });
}

exports.handler = async (event, context) => {
  let browser = null;
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    console.log('Received event body:', JSON.stringify(body, null, 2));
    
    // NEW: Accept client_id instead of credentials
    const { client_id, accounts, async: asyncMode, webhookUrl } = body;
    
    // Also support legacy mode with direct credentials
    let { replyioEmail, replyioPassword } = body;
    
    console.log('Parsed parameters:', { 
      client_id,
      replyioEmail: replyioEmail ? 'direct' : 'from secrets',
      accounts: accounts ? `${accounts.length} accounts` : undefined,
      async: asyncMode,
      webhookUrl: webhookUrl ? 'provided' : 'not provided'
    });
    
    // If client_id is provided, fetch credentials from Secrets Manager
    if (client_id && (!replyioEmail || !replyioPassword)) {
      console.log(`Fetching credentials from AWS Secrets Manager for client: ${client_id}`);
      const credentials = await getClientCredentials(client_id);
      replyioEmail = credentials.replyioEmail;
      replyioPassword = credentials.replyioPassword;
      
      if (!replyioEmail || !replyioPassword) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Reply.io UI credentials not found in Secrets Manager',
            client_id,
            hint: 'Ensure reply_io_user and reply_io_password are stored in AWS Secrets Manager for this client'
          })
        };
      }
    }
    
    // Validate required fields
    if (!replyioEmail || !replyioPassword || !accounts || !Array.isArray(accounts)) {
      const missingFields = [];
      if (!client_id && !replyioEmail) missingFields.push('client_id or replyioEmail');
      if (!client_id && !replyioPassword) missingFields.push('client_id or replyioPassword');
      if (!accounts) missingFields.push('accounts');
      if (accounts && !Array.isArray(accounts)) missingFields.push('accounts (not an array)');
      
      console.error('Validation failed. Missing fields:', missingFields);
      
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing or invalid parameters',
          missingFields: missingFields,
          received: {
            client_id: client_id ? '✓ provided' : '✗ missing',
            replyioEmail: replyioEmail ? '✓ available' : '✗ missing',
            replyioPassword: replyioPassword ? '✓ available' : '✗ missing',
            accounts: accounts ? (Array.isArray(accounts) ? `✓ array with ${accounts.length} items` : '✗ not an array') : '✗ missing',
            async: asyncMode !== undefined ? `✓ ${asyncMode}` : 'optional (not provided)',
            webhookUrl: webhookUrl ? '✓ provided' : 'optional (not provided)'
          },
          expected: {
            client_id: 'string (required) - Client ID to fetch credentials from Secrets Manager',
            accounts: 'array (required) - [{ email: string, accountId: string, signature: string }]',
            async: 'boolean (optional) - set true for webhook callback',
            webhookUrl: 'string (optional) - POST results here when async=true'
          },
          legacy: {
            note: 'You can also pass replyioEmail and replyioPassword directly (not recommended)'
          }
        })
      };
    }

    // Validate accounts array structure
    if (accounts.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Empty accounts array',
          received: {
            accounts: '✗ empty array (no accounts to process)'
          },
          expected: {
            accounts: 'array with at least one account: [{ email: string, accountId: string, signature: string }]'
          }
        })
      };
    }

    // Validate each account has required fields
    const accountErrors = [];
    accounts.forEach((account, index) => {
      const missing = [];
      if (!account.email) missing.push('email');
      if (!account.accountId) missing.push('accountId');
      if (!account.signature) missing.push('signature');
      
      if (missing.length > 0) {
        accountErrors.push({
          index: index,
          received: account,
          missingFields: missing
        });
      }
    });

    if (accountErrors.length > 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid account objects in array',
          invalidAccounts: accountErrors,
          expected: {
            accountFormat: '{ email: string, accountId: string, signature: string }'
          }
        })
      };
    }

    // If async mode, process everything then send webhook
    if (asyncMode === true) {
      console.log('Async mode enabled - processing will complete and send webhook');
      
      try {
        const result = await processSignatures(replyioEmail, replyioPassword, accounts);
        console.log('Processing completed successfully:', JSON.stringify(result, null, 2));
        
        // Send webhook notification if URL provided
        if (webhookUrl) {
          console.log('Sending results to webhook:', webhookUrl);
          await sendWebhook(webhookUrl, {
            status: 'completed',
            timestamp: new Date().toISOString(),
            result: result
          });
          console.log('Webhook sent successfully');
        }
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Processing error:', error);
        
        // Send error to webhook if URL provided
        if (webhookUrl) {
          try {
            await sendWebhook(webhookUrl, {
              status: 'failed',
              timestamp: new Date().toISOString(),
              error: error.message,
              stack: error.stack
            });
          } catch (webhookError) {
            console.error('Failed to send error webhook:', webhookError);
          }
        }
        
        throw error;
      }
    }

    // Synchronous mode
    const result = await processSignatures(replyioEmail, replyioPassword, accounts);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      })
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
  }
};

// Process signatures using Puppeteer (web automation)
async function processSignatures(email, password, accounts) {
  console.log(`Starting signature update for ${accounts.length} accounts`);
  
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  
  const results = [];
  
  try {
    const page = await browser.newPage();
    
    // Login to Reply.io
    console.log('Navigating to Reply.io login...');
    await page.goto('https://app.reply.io/login', { waitUntil: 'networkidle0' });
    
    // Enter credentials
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    console.log('Logged in successfully');
    
    // Process each account
    for (const account of accounts) {
      try {
        console.log(`Processing account: ${account.email} (ID: ${account.accountId})`);
        
        // Navigate to email account settings
        const settingsUrl = `https://app.reply.io/settings/email-accounts/${account.accountId}`;
        await page.goto(settingsUrl, { waitUntil: 'networkidle0' });
        
        // Wait for signature editor to load
        await wait(2000);
        
        // Find and update signature field
        // Note: This selector may need adjustment based on Reply.io's actual UI
        const signatureSelector = '[data-testid="signature-editor"], .signature-editor, textarea[name="signature"]';
        
        try {
          await page.waitForSelector(signatureSelector, { timeout: 10000 });
          
          // Clear existing signature
          await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            if (el) {
              el.innerHTML = '';
              el.value = '';
            }
          }, signatureSelector);
          
          // Enter new signature (HTML)
          await page.evaluate((selector, signature) => {
            const el = document.querySelector(selector);
            if (el) {
              if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                el.value = signature;
              } else {
                el.innerHTML = signature;
              }
              // Trigger change event
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, signatureSelector, account.signature);
          
          // Save changes
          const saveButton = await page.$('button[type="submit"], button:has-text("Save"), .save-button');
          if (saveButton) {
            await saveButton.click();
            await wait(2000);
          }
          
          results.push({
            email: account.email,
            accountId: account.accountId,
            status: 'success',
            message: 'Signature updated successfully'
          });
          
          console.log(`✅ Updated signature for ${account.email}`);
          
        } catch (selectorError) {
          console.error(`Failed to find signature editor for ${account.email}:`, selectorError.message);
          results.push({
            email: account.email,
            accountId: account.accountId,
            status: 'error',
            message: `Failed to find signature editor: ${selectorError.message}`
          });
        }
        
        // Small delay between accounts
        await wait(1000);
        
      } catch (accountError) {
        console.error(`Error processing ${account.email}:`, accountError.message);
        results.push({
          email: account.email,
          accountId: account.accountId,
          status: 'error',
          message: accountError.message
        });
      }
    }
    
  } finally {
    await browser.close();
  }
  
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  
  console.log(`Processing complete: ${successCount} success, ${errorCount} errors`);
  
  return {
    total: accounts.length,
    success: successCount,
    errors: errorCount,
    results: results
  };
}
