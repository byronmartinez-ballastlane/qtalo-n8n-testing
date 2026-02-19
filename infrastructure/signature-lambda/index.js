
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function getChromiumExecutablePath() {
  const localChromiumPath = path.join(__dirname, 'node_modules', '@sparticuz', 'chromium', 'bin');
  
  if (fs.existsSync(localChromiumPath)) {
    console.log('📦 Using bundled Chromium from local node_modules');
    return await chromium.executablePath();
  }
  
  const layerPath = '/opt/nodejs/node_modules/@sparticuz/chromium/bin';
  if (fs.existsSync(layerPath)) {
    console.log('📦 Using Chromium from Lambda layer');
    process.env.CHROMIUM_PATH = '/opt/nodejs/node_modules/@sparticuz/chromium';
  }
  
  return await chromium.executablePath();
}
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'qtalo-n8n-clients-prod';
const secretsClient = new SecretsManagerClient({ region: REGION });
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getClientConfig(clientId) {
  try {
    console.log(`Fetching client config from DynamoDB: ${clientId}`);
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { client_id: clientId }
    }));
    
    if (!result.Item) {
      throw new Error(`Client not found in DynamoDB: ${clientId}`);
    }
    
    const expectedDomains = result.Item.expected_domains || [];
    if (expectedDomains.length === 0) {
      console.log(`ℹ️ No expected_domains configured for client ${clientId}. Domain filtering will be skipped.`);
    } else {
      console.log(`📋 Expected domains for client ${clientId}: ${expectedDomains.join(', ')}`);
    }
    
    const replyWorkspaceId = result.Item.reply_workspace_id || null;
    if (replyWorkspaceId) {
      console.log(`🏢 Reply.io workspace for client ${clientId}: ${replyWorkspaceId}`);
    } else {
      console.log(`⚠️ No reply_workspace_id configured for client ${clientId} - will use default workspace`);
    }
    
    return {
      expectedDomains,
      clientName: result.Item.client_name,
      status: result.Item.status,
      replyWorkspaceId
    };
  } catch (error) {
    console.error(`❌ Failed to fetch client config from DynamoDB:`, error.message);
    throw new Error(`Failed to fetch client config: ${clientId}. Error: ${error.message}`);
  }
}

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

function validateAccountDomains(accounts, expectedDomains, dryRun = false) {
  if (!expectedDomains || expectedDomains.length === 0) {
    console.log('ℹ️ No expected_domains configured. Allowing all accounts (domains derived from CSV).');
    return { 
      valid: true, 
      accounts: accounts, 
      rejectedAccounts: [], 
      message: `All ${accounts.length} accounts allowed (no domain filter configured)`,
      noDomainFilter: true
    };
  }
  
  const normalizedDomains = expectedDomains.map(d => d.toLowerCase().trim());
  const validAccounts = [];
  const rejectedAccounts = [];
  
  for (const account of accounts) {
    const email = (account.email || '').toLowerCase();
    const domain = email.split('@')[1];
    
    if (!domain) {
      rejectedAccounts.push({ 
        ...account, 
        rejectionReason: 'Invalid email format - no domain found' 
      });
      continue;
    }
    
    if (normalizedDomains.includes(domain)) {
      validAccounts.push(account);
    } else {
      rejectedAccounts.push({ 
        ...account, 
        rejectionReason: `Domain '${domain}' not in expected domains: [${normalizedDomains.join(', ')}]` 
      });
    }
  }
  
  console.log(`📊 Domain validation results:`);
  console.log(`   ✅ Valid accounts: ${validAccounts.length}`);
  console.log(`   ❌ Rejected accounts: ${rejectedAccounts.length}`);
  
  if (rejectedAccounts.length > 0) {
    console.log(`   Rejected emails:`);
    rejectedAccounts.forEach(a => console.log(`      - ${a.email}: ${a.rejectionReason}`));
  }
  
  if (validAccounts.length === 0 && accounts.length > 0) {
    const errorMsg = `SECURITY BLOCK: All ${accounts.length} accounts were rejected by domain validation. ` +
      `Expected domains: [${normalizedDomains.join(', ')}]. ` +
      `Received domains: [${[...new Set(accounts.map(a => a.email.split('@')[1]))].join(', ')}]. ` +
      `This may indicate a misconfiguration or cross-tenant data leak attempt.`;
    console.error(`❌ ${errorMsg}`);
    return { 
      valid: false, 
      accounts: [], 
      rejectedAccounts, 
      message: errorMsg,
      securityBlock: true
    };
  }
  
  return { 
    valid: true, 
    accounts: validAccounts, 
    rejectedAccounts,
    message: rejectedAccounts.length > 0 
      ? `${rejectedAccounts.length} accounts rejected by domain validation, ${validAccounts.length} accounts will be processed`
      : `All ${validAccounts.length} accounts passed domain validation`
  };
}

async function syncExpectedDomains(clientId, processedDomains) {
  if (!clientId || !processedDomains || processedDomains.length === 0) {
    console.log('ℹ️ syncExpectedDomains: Nothing to sync (no client_id or domains)');
    return { synced: false, reason: 'no data' };
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { client_id: clientId }
    }));

    if (!result.Item) {
      console.log(`⚠️ syncExpectedDomains: Client ${clientId} not found in DynamoDB, skipping`);
      return { synced: false, reason: 'client not found' };
    }

    const currentDomains = (result.Item.expected_domains || []).map(d => d.toLowerCase().trim());
    const newDomains = processedDomains.map(d => d.toLowerCase().trim());

    const mergedSet = new Set([...currentDomains, ...newDomains]);
    const mergedDomains = [...mergedSet].sort();

    const currentSorted = [...currentDomains].sort();
    if (JSON.stringify(currentSorted) === JSON.stringify(mergedDomains)) {
      console.log(`✅ syncExpectedDomains: DynamoDB already has all ${mergedDomains.length} domain(s): ${mergedDomains.join(', ')}`);
      return { synced: false, reason: 'already in sync', domains: mergedDomains };
    }

    console.log(`🔄 syncExpectedDomains: Updating DynamoDB for client ${clientId}`);
    console.log(`   Before: [${currentSorted.join(', ')}] (${currentSorted.length})`);
    console.log(`   After:  [${mergedDomains.join(', ')}] (${mergedDomains.length})`);

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { client_id: clientId },
      UpdateExpression: 'SET expected_domains = :domains, updated_at = :ts',
      ExpressionAttributeValues: {
        ':domains': mergedDomains,
        ':ts': new Date().toISOString()
      }
    }));

    console.log(`✅ syncExpectedDomains: DynamoDB updated with ${mergedDomains.length} domain(s)`);
    return { synced: true, domains: mergedDomains, added: mergedDomains.filter(d => !currentDomains.includes(d)) };
  } catch (error) {
    console.error(`⚠️ syncExpectedDomains: Failed to sync domains to DynamoDB:`, error.message);
    return { synced: false, reason: 'error', error: error.message };
  }
}

async function switchToWorkspace(page, workspaceName) {
  if (!workspaceName) {
    console.log('⚠️ No workspace name provided, skipping workspace switch');
    return { success: true, skipped: true, message: 'No workspace name provided' };
  }
  
  console.log(`🏢 Switching to workspace: "${workspaceName}"`);
  
  try {
    await wait(2000);
    
    let workspaceButton = null;
    
    workspaceButton = await page.$('[data-test-id="avatar"][aria-label^="Client:"]');
    
    if (!workspaceButton) {
      workspaceButton = await page.$('.MuiAvatar-root[aria-label^="Client:"]');
    }
    
    if (!workspaceButton) {
      const avatars = await page.$$('[data-test-id="avatar"]');
      for (const avatar of avatars) {
        const ariaLabel = await avatar.evaluate(el => el.getAttribute('aria-label'));
        if (ariaLabel && ariaLabel.includes('Client:')) {
          workspaceButton = avatar;
          console.log(`Found workspace avatar with aria-label: ${ariaLabel}`);
          break;
        }
      }
    }
    
    if (!workspaceButton) {
      console.log(`⚠️ Could not find workspace selector button. Current URL: ${page.url()}`);
      return { 
        success: false, 
        error: 'Could not find workspace selector button'
      };
    }
    
    console.log('🖱️ Clicking workspace selector button to open dropdown...');
    await workspaceButton.click();
    await wait(1500);
    
    
    const extractedWorkspaces = await page.evaluate(() => {
      const switchLinks = Array.from(document.querySelectorAll('a[href*="SwitchTeam?teamId="]'));
      
      const seenTeamIds = new Set();
      const workspaces = [];
      
      for (const link of switchLinks) {
        const href = link.getAttribute('href') || '';
        const teamIdMatch = href.match(/teamId=(\d+)/);
        const teamId = teamIdMatch ? teamIdMatch[1] : null;
        
        if (teamId && seenTeamIds.has(teamId)) continue;
        if (teamId) seenTeamIds.add(teamId);
        
        const pElement = link.querySelector('p[aria-label]');
        const ariaLabel = pElement?.getAttribute('aria-label') || '';
        const textContent = pElement?.textContent?.trim() || link.textContent?.trim() || '';
        
        workspaces.push({
          teamId: teamId,
          ariaLabel: ariaLabel,
          textContent: textContent,
          href: href
        });
      }
      
      return workspaces;
    });
    
    console.log(`📋 Found ${extractedWorkspaces.length} unique workspaces in dropdown:`);
    for (const ws of extractedWorkspaces) {
      console.log(`   📌 aria-label="${ws.ariaLabel}" | text="${ws.textContent}" | teamId=${ws.teamId}`);
    }
    
    const normalize = (str) => (str || '').trim().toLowerCase();
    const targetNormalized = normalize(workspaceName);
    
    console.log(`🔍 Looking for EXACT match: "${workspaceName}" (normalized: "${targetNormalized}")`);
    
    const exactMatch = extractedWorkspaces.find(w => normalize(w.ariaLabel) === targetNormalized);
    
    let workspaceResult;
    if (exactMatch) {
      console.log(`✅ EXACT MATCH FOUND: aria-label="${exactMatch.ariaLabel}" | teamId=${exactMatch.teamId}`);
      workspaceResult = {
        found: true,
        teamId: exactMatch.teamId,
        name: exactMatch.ariaLabel,
        href: exactMatch.href
      };
    } else {
      console.log(`❌ No exact match for "${workspaceName}" - available workspaces:`);
      extractedWorkspaces.forEach(w => console.log(`   - "${w.ariaLabel}" (teamId: ${w.teamId})`));
      workspaceResult = {
        found: false,
        availableWorkspaces: extractedWorkspaces.map(w => ({ name: w.ariaLabel, teamId: w.teamId }))
      };
    }
    
    await page.keyboard.press('Escape');
    await wait(500);
    
    if (!workspaceResult.found) {
      console.log(`❌ Workspace "${workspaceName}" not found (exact match required)`);
      console.log(`   Available workspaces: ${JSON.stringify(workspaceResult.availableWorkspaces)}`);
      
      return {
        success: false,
        error: `Workspace "${workspaceName}" not found (exact match required)`,
        availableWorkspaces: workspaceResult.availableWorkspaces
      };
    }
    
    const switchUrl = `https://run.reply.io/Home/SwitchTeam?teamId=${workspaceResult.teamId}`;
    console.log(`🔗 Navigating directly to workspace: ${switchUrl}`);
    
    await page.goto(switchUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(2000);
    
    console.log(`✅ Successfully switched to workspace: "${workspaceResult.name}" (teamId: ${workspaceResult.teamId})`);
    console.log(`🏢 Current URL: ${page.url()}`);
    
    return { 
      success: true, 
      workspace: workspaceResult.name,
      teamId: workspaceResult.teamId,
      message: `Switched to workspace: ${workspaceResult.name}`
    };
    
  } catch (error) {
    console.error(`❌ Error switching workspace:`, error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function sendWebhook(webhookUrl, data) {
  if (!webhookUrl) {
    console.log('No webhook URL provided, skipping notification');
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const params = new URLSearchParams({
        status: data.status,
        timestamp: data.timestamp,
        result: JSON.stringify(data.result)
      });
      
      const url = new URL(webhookUrl);
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

async function verifyDomainsExistInReplyio(page, expectedDomains) {
  console.log('🔍 Verifying expected domains exist in Reply.io...');
  console.log(`   Expected domains: [${expectedDomains.join(', ')}]`);
  
  await wait(2000);
  
  const foundDomains = await page.evaluate(() => {
    const domains = [];
    
    const domainElements = document.querySelectorAll('[class*="domain"], [data-domain], a[href*="domain"]');
    domainElements.forEach(el => {
      const text = el.textContent?.trim().toLowerCase();
      if (text && text.includes('.') && !text.includes(' ')) {
        domains.push(text);
      }
    });
    
    const allText = document.body.innerText;
    const domainRegex = /([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}/gi;
    const matches = allText.match(domainRegex) || [];
    matches.forEach(match => {
      const domain = match.toLowerCase();
      if (!domain.includes('reply.io') && 
          !domain.includes('google.com') &&
          !domain.includes('cloudflare') &&
          !domains.includes(domain)) {
        domains.push(domain);
      }
    });
    
    return [...new Set(domains)];
  });
  
  console.log(`   Found domains in Reply.io: [${foundDomains.join(', ')}]`);
  
  const normalizedExpected = expectedDomains.map(d => d.toLowerCase().trim());
  const existingDomains = [];
  const missingDomains = [];
  
  for (const expected of normalizedExpected) {
    const found = foundDomains.some(found => 
      found === expected || found.endsWith('.' + expected)
    );
    
    if (found) {
      existingDomains.push(expected);
    } else {
      missingDomains.push(expected);
    }
  }
  
  return {
    success: missingDomains.length === 0,
    existingDomains,
    missingDomains,
    foundDomains,
    message: missingDomains.length === 0 
      ? `All expected domains found in Reply.io: [${existingDomains.join(', ')}]`
      : `DOMAIN NOT FOUND: The following domains do not exist in Reply.io yet: [${missingDomains.join(', ')}]. ` +
        `Please run Phase 1 (Import & Hygiene) first to create mailboxes for these domains. ` +
        `Available domains: [${foundDomains.join(', ')}]`
  };
}

exports.handler = async (event, context) => {
  let browser = null;
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    console.log('Received event body:', JSON.stringify(body, null, 2));
    
    const { client_id, accounts, async: asyncMode, webhookUrl, dry_run: dryRun } = body;
    
    let { replyioEmail, replyioPassword } = body;
    
    let expectedDomains = body.expected_domains || [];
    
    let replyWorkspaceId = body.reply_workspace_id || null;
    
    console.log('Parsed parameters:', { 
      client_id: client_id || 'not provided',
      replyioEmail: replyioEmail ? 'direct (legacy)' : 'from secrets',
      replyioPassword: replyioPassword ? '***' : undefined, 
      accounts: accounts ? `${accounts.length} accounts` : undefined,
      async: asyncMode,
      webhookUrl: webhookUrl ? 'provided' : 'not provided',
      dry_run: dryRun || false,
      expected_domains: expectedDomains.length > 0 ? expectedDomains : 'from DynamoDB',
      reply_workspace_id: replyWorkspaceId || 'from DynamoDB'
    });
    
    if (client_id && (!replyioEmail || !replyioPassword)) {
      console.log(`Fetching config and credentials for client: ${client_id}`);
      try {
        const clientConfig = await getClientConfig(client_id);
        
        if (expectedDomains.length === 0 && clientConfig.expectedDomains) {
          expectedDomains = clientConfig.expectedDomains;
          console.log(`📋 Using expected_domains from DynamoDB: [${expectedDomains.join(', ')}]`);
        }
        
        if (!replyWorkspaceId && clientConfig.replyWorkspaceId) {
          replyWorkspaceId = clientConfig.replyWorkspaceId;
          console.log(`🏢 Using reply_workspace_id from DynamoDB: ${replyWorkspaceId}`);
        }
        
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
        console.log(`✅ Retrieved Reply.io UI credentials for client: ${client_id}`);
      } catch (fetchError) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Failed to fetch client config or credentials',
            client_id,
            message: fetchError.message
          })
        };
      }
    }
    
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
            replyioEmail: replyioEmail ? '✓ provided' : '✗ missing',
            replyioPassword: replyioPassword ? '✓ provided' : '✗ missing',
            accounts: accounts ? (Array.isArray(accounts) ? `✓ array with ${accounts.length} items` : '✗ not an array') : '✗ missing',
            async: asyncMode !== undefined ? `✓ ${asyncMode}` : 'optional (not provided)',
            webhookUrl: webhookUrl ? '✓ provided' : 'optional (not provided)'
          },
          expected: {
            client_id: 'string (recommended) - Client ID to fetch credentials from Secrets Manager',
            accounts: 'array (required) - [{ email: string, accountId: string, signature: string }]',
            async: 'boolean (optional) - set true for webhook callback',
            webhookUrl: 'string (optional) - POST results here when async=true'
          },
          legacy: {
            replyioEmail: 'string (legacy) - Reply.io account email (use client_id instead)',
            replyioPassword: 'string (legacy) - Reply.io account password (use client_id instead)'
          }
        })
      };
    }

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

    console.log('🔒 Performing multi-tenancy domain validation...');
    const domainValidation = validateAccountDomains(accounts, expectedDomains, dryRun);
    
    if (!domainValidation.valid) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'SECURITY_BLOCK',
          message: domainValidation.message,
          securityBlock: true,
          client_id: client_id,
          expected_domains: expectedDomains,
          received_domains: [...new Set(accounts.map(a => a.email.split('@')[1]))],
          rejected_accounts: domainValidation.rejectedAccounts.map(a => ({
            email: a.email,
            reason: a.rejectionReason
          })),
          hint: 'Ensure expected_domains in AWS Secrets Manager matches the domains in your mailbox CSV'
        })
      };
    }
    
    const validatedAccounts = domainValidation.accounts;
    const rejectedAccounts = domainValidation.rejectedAccounts;
    
    console.log(`✅ Domain validation passed: ${validatedAccounts.length} accounts approved, ${rejectedAccounts.length} rejected`);
    
    if (dryRun === true) {
      console.log('🔍 DRY RUN MODE - Returning validation results without modifying signatures');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dry_run: true,
          message: 'Validation completed - no changes made',
          domain_validation: {
            expected_domains: expectedDomains,
            validation_result: domainValidation.message
          },
          approved_accounts: validatedAccounts.map(a => ({ email: a.email, accountId: a.accountId })),
          rejected_accounts: rejectedAccounts.map(a => ({ email: a.email, reason: a.rejectionReason })),
          summary: {
            total_requested: accounts.length,
            approved: validatedAccounts.length,
            rejected: rejectedAccounts.length
          },
          next_steps: validatedAccounts.length > 0 
            ? 'Run again without dry_run=true to apply signatures'
            : 'Fix expected_domains configuration before proceeding'
        })
      };
    }

    if (asyncMode === true) {
      console.log('Async mode enabled - processing will complete and send webhook');
      console.log('Note: API Gateway may timeout (503) but Lambda continues processing');
      
      try {
        const result = await processSignatures(replyioEmail, replyioPassword, validatedAccounts, expectedDomains, replyWorkspaceId);
        
        const enhancedResult = {
          ...result,
          domain_validation: {
            expected_domains: expectedDomains,
            approved_count: validatedAccounts.length,
            rejected_count: rejectedAccounts.length,
            rejected_accounts: rejectedAccounts.map(a => ({ email: a.email, reason: a.rejectionReason }))
          }
        };
        
        console.log('Processing completed successfully:', JSON.stringify(enhancedResult, null, 2));
        
        const domainSync = await syncExpectedDomains(client_id, expectedDomains);
        if (domainSync.synced) {
          enhancedResult.domain_sync = domainSync;
        }
        
        if (webhookUrl) {
          console.log('Sending results to webhook:', webhookUrl);
          await sendWebhook(webhookUrl, {
            status: 'completed',
            timestamp: new Date().toISOString(),
            result: enhancedResult
          });
          console.log('Webhook sent successfully');
        }
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancedResult)
        };
      } catch (error) {
        console.error('Processing error:', error);
        
        if (webhookUrl) {
          try {
            await sendWebhook(webhookUrl, {
              status: 'failed',
              timestamp: new Date().toISOString(),
              error: error.message,
              stack: error.stack,
              domain_validation: {
                expected_domains: expectedDomains,
                approved_count: validatedAccounts.length,
                rejected_count: rejectedAccounts.length
              }
            });
          } catch (webhookError) {
            console.error('Failed to send error webhook:', webhookError);
          }
        }
        
        throw error;
      }
    }

    console.log('Starting synchronous processing...');
    const result = await processSignatures(replyioEmail, replyioPassword, validatedAccounts, expectedDomains, replyWorkspaceId);
    
    const domainSync = await syncExpectedDomains(client_id, expectedDomains);
    
    const enhancedSyncResult = {
      ...result,
      domain_validation: {
        expected_domains: expectedDomains,
        approved_count: validatedAccounts.length,
        rejected_count: rejectedAccounts.length,
        rejected_accounts: rejectedAccounts.map(a => ({ email: a.email, reason: a.rejectionReason }))
      },
      ...(domainSync.synced ? { domain_sync: domainSync } : {})
    };
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enhancedSyncResult)
    };

  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
};


async function processSignatures(replyioEmail, replyioPassword, accounts, expectedDomains = [], replyWorkspaceId = null) {
  let browser = null;
  
  try {
    console.log(`Processing ${accounts.length} accounts...`);
    console.log(`Expected domains: [${expectedDomains.join(', ')}]`);
    if (replyWorkspaceId) {
      console.log(`🏢 Target workspace: ${replyWorkspaceId}`);
    }

    const execPath = await getChromiumExecutablePath();
    console.log(`🌐 Chromium executable path: ${execPath}`);

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: execPath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      window.chrome = {
        runtime: {},
      };
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 1,
      });
    });
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    console.log('Navigating directly to Reply.io email accounts settings...');
    
    await page.goto('https://run.reply.io/Dashboard/Material#/settings/email-accounts/', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    await wait(10000);
    
    const pageContent = await page.content();
    const currentUrl = page.url();
    console.log('Page URL:', currentUrl);
    console.log('Page title:', await page.title());
    console.log('Page content length:', pageContent.length);
    
    const screenshot = await page.screenshot({ encoding: 'base64' });
    console.log('Screenshot taken, length:', screenshot.length);
    
    const isLoginPage = currentUrl.includes('/login') || 
                        pageContent.toLowerCase().includes('sign in') ||
                        pageContent.toLowerCase().includes('log in');
    
    console.log('Is login page:', isLoginPage);
    
    if (!isLoginPage) {
      console.log('✅ Already on email accounts page or authenticated area!');
      
      if (replyWorkspaceId) {
        console.log(`🏢 Already authenticated - switching to workspace: ${replyWorkspaceId}`);
        const workspaceResult = await switchToWorkspace(page, replyWorkspaceId);
        
        if (!workspaceResult.success && !workspaceResult.skipped) {
          console.error(`❌ Failed to switch to workspace: ${workspaceResult.error}`);
          console.log('⚠️ Continuing with current workspace...');
        } else if (workspaceResult.success && !workspaceResult.skipped) {
          console.log(`✅ Successfully switched to workspace: ${workspaceResult.workspace}`);
          await page.goto('https://run.reply.io/Dashboard/Material#/settings/email-accounts/', { 
            waitUntil: 'networkidle0',
            timeout: 60000 
          });
          await wait(3000);
        }
      }
      
    } else {
      console.log('🔐 On login page, attempting to authenticate...');
    
    const hasCaptcha = pageContent.toLowerCase().includes('captcha') || 
                       pageContent.toLowerCase().includes('recaptcha') ||
                       pageContent.toLowerCase().includes('cloudflare');
    if (hasCaptcha) {
      console.log('⚠️ Possible CAPTCHA or bot protection detected');
    }
    
    const inputTypes = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({
        type: i.type,
        name: i.name,
        id: i.id,
        placeholder: i.placeholder,
        className: i.className,
        visible: i.offsetParent !== null
      }));
    });
    console.log('Found inputs:', JSON.stringify(inputTypes));
    
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[placeholder*="email" i]',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]',
      'input.email',
      'input[type="text"]'
    ];
    
    let emailInput = null;
    for (const selector of emailSelectors) {
      emailInput = await page.$(selector);
      if (emailInput) {
        const isVisible = await emailInput.evaluate(el => el.offsetParent !== null);
        if (isVisible) {
          console.log(`Found email input with selector: ${selector}`);
          break;
        }
      }
    }
    
    if (!emailInput) {
      console.log('Trying to find first visible input...');
      emailInput = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const visibleInput = inputs.find(input => 
          input.offsetParent !== null && 
          input.type !== 'hidden' &&
          !input.disabled
        );
        return visibleInput;
      });
      
      if (emailInput && emailInput.asElement()) {
        emailInput = emailInput.asElement();
      } else {
        emailInput = null;
      }
    }
    
    if (!emailInput) {
      console.log('Could not find email input. Available selectors:', inputTypes);
      console.log('Page HTML snippet:', pageContent.substring(0, 2000));
      throw new Error('Could not find email input field - page might be blocked or different');
    }
    
    console.log('Found email input, typing credentials...');
    await emailInput.click({ delay: 100 });
    await wait(500);
    await emailInput.type(replyioEmail, { delay: 120 });
    await wait(1000);
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password" i]',
      'input[placeholder*="password" i]',
      'input[autocomplete="current-password"]'
    ];
    
    let passwordInput = null;
    for (const selector of passwordSelectors) {
      passwordInput = await page.$(selector);
      if (passwordInput) {
        const isVisible = await passwordInput.evaluate(el => el.offsetParent !== null);
        if (isVisible) {
          console.log(`Found password input with selector: ${selector}`);
          break;
        }
      }
    }
    
    if (!passwordInput) {
      throw new Error('Could not find password input');
    }
    
    await passwordInput.click({ delay: 100 });
    await wait(500);
    await passwordInput.type(replyioPassword, { delay: 120 });
    await wait(1000);
    
    console.log('Clicking submit button...');
    const submitSelectors = [
      'button[type="submit"]',
      'button[id*="submit" i]',
      'button[class*="submit" i]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Sign in")'
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      try {
        submitButton = await page.$(selector);
        if (submitButton) {
          const isVisible = await submitButton.evaluate(el => el.offsetParent !== null);
          if (isVisible) {
            console.log(`Found submit button with selector: ${selector}`);
            break;
          }
        }
      } catch (e) {
      }
    }
    
    if (!submitButton) {
      submitButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(btn => 
          btn.offsetParent !== null &&
          !btn.disabled &&
          (btn.textContent.toLowerCase().includes('log in') ||
           btn.textContent.toLowerCase().includes('sign in') ||
           btn.type === 'submit')
        );
        return submitBtn;
      });
      
      if (submitButton && submitButton.asElement()) {
        submitButton = submitButton.asElement();
      } else {
        submitButton = null;
      }
    }
    
    if (!submitButton) {
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent.trim(),
          type: b.type,
          className: b.className,
          visible: b.offsetParent !== null
        }));
      });
      console.log('Available buttons:', JSON.stringify(buttons));
      throw new Error('Could not find submit button');
    }
    
    await wait(500);
    await Promise.all([
      submitButton.click(),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 }).catch(() => {
        console.log('Navigation timeout, but continuing...');
      })
    ]);
    
    console.log('Login successful, navigated to:', page.url());
    
    if (replyWorkspaceId) {
      console.log(`🏢 Attempting to switch to workspace: ${replyWorkspaceId}`);
      const workspaceResult = await switchToWorkspace(page, replyWorkspaceId);
      
      if (!workspaceResult.success && !workspaceResult.skipped) {
        console.error(`❌ Failed to switch to workspace: ${workspaceResult.error}`);
        console.log('⚠️ Continuing with current workspace...');
      } else if (workspaceResult.success && !workspaceResult.skipped) {
        console.log(`✅ Successfully switched to workspace: ${workspaceResult.workspace}`);
      }
    }
    
    await page.goto('https://run.reply.io/Dashboard/Material#/settings/email-accounts/', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await wait(3000);
    }
    
    console.log('Current URL:', page.url());
    
    if (expectedDomains && expectedDomains.length > 0) {
      console.log('🔒 Verifying expected domains exist in Reply.io Email Accounts...');
      const domainVerification = await verifyDomainsExistInReplyio(page, expectedDomains);
      
      if (!domainVerification.success) {
        console.error(`❌ Domain verification failed: ${domainVerification.message}`);
        await browser.close();
        return {
          error: 'DOMAIN_NOT_FOUND',
          message: domainVerification.message,
          expected_domains: expectedDomains,
          missing_domains: domainVerification.missingDomains,
          found_domains: domainVerification.foundDomains,
          hint: 'Run Phase 1 (Import & Hygiene) first to create mailboxes for the expected domains, ' +
                'or update expected_domains in the client configuration to match available domains.'
        };
      }
      console.log(`✅ Domain verification passed: ${domainVerification.message}`);
    }
    
    console.log('Processing email accounts...');

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`[${i + 1}/${accounts.length}] Processing ${account.email}...`);
      
      try {
        if (account.accountId) {
          console.log(`Navigating directly to account ${account.accountId} edit page...`);
          const accountUrl = `https://run.reply.io/Dashboard/Material#/settings/email-accounts/${account.accountId}/other/edit`;
          await page.goto(accountUrl, { waitUntil: 'networkidle0', timeout: 60000 });
          await wait(1500);
          
          console.log(`Navigated to: ${page.url()}`);
          
        } else {
          console.log(`No accountId provided, searching for ${account.email} on page...`);
        
          const emailAccountsScreenshot = await page.screenshot({ encoding: 'base64' });
          console.log(`Email accounts page screenshot length: ${emailAccountsScreenshot.length}`);
          
          const pageText = await page.evaluate(() => document.body.innerText);
          console.log(`Page text preview (first 500 chars): ${pageText.substring(0, 500)}`);
          
          const allEmails = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
            const emails = new Set();
            elements.forEach(el => {
              const matches = el.textContent.match(emailRegex);
              if (matches) matches.forEach(m => emails.add(m));
            });
            return Array.from(emails);
          });
          console.log(`Found emails on page:`, JSON.stringify(allEmails));
        
        const accountFound = await page.evaluate((email) => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => el.textContent.includes(email));
        }, account.email);
        
        console.log(`Account ${account.email} found: ${accountFound}`);
        
        if (!accountFound) {
          console.log(`Account ${account.email} not found on page`);
          results.push({ email: account.email, success: false, error: 'Account not found on page' });
          failCount++;
          continue;
        }
        
        const clickResult = await page.evaluate((email) => {
          const elements = Array.from(document.querySelectorAll('*'));
          const accountEl = elements.find(el => el.textContent.trim() === email || el.textContent.includes(email));
          
          if (!accountEl) {
            return { success: false, error: 'Could not find element with email text' };
          }
          
          console.log('Found element with email:', accountEl.tagName, accountEl.className);
          
          const possibleRows = [
            accountEl.closest('tr'),
            accountEl.closest('div[role="row"]'),
            accountEl.closest('.account-row'),
            accountEl.closest('[class*="row"]'),
            accountEl.closest('li'),
            accountEl.closest('div[class*="account"]'),
            accountEl.closest('div[class*="item"]')
          ].filter(Boolean);
          
          console.log('Found possible rows:', possibleRows.length);
          
          if (possibleRows.length === 0) {
            console.log('No row found, trying to click element directly');
            accountEl.click();
            return { success: true, method: 'direct element click' };
          }
          
          const row = possibleRows[0];
          console.log('Using row:', row.tagName, row.className);
          
          const allInteractive = row.querySelectorAll('button, a, [role="button"], [onclick], svg, path');
          console.log('Found interactive elements in row:', allInteractive.length);
          
          const buttons = [];
          for (const el of allInteractive) {
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
              buttons.push(el);
            } else if ((el.tagName === 'svg' || el.tagName === 'path') && el.closest('button, a, [role="button"]')) {
              const btn = el.closest('button, a, [role="button"]');
              if (!buttons.includes(btn)) buttons.push(btn);
            }
          }
          
          console.log('Filtered to actual buttons:', buttons.length);
          
          for (const btn of buttons) {
            const btnText = btn.textContent.toLowerCase().trim();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const className = (btn.className || '').toLowerCase();
            
            console.log('Checking button:', { 
              text: btnText.substring(0, 30), 
              ariaLabel, 
              title, 
              className: className.substring(0, 50),
              hasSvg: btn.querySelector('svg') !== null
            });
            
            if (btnText.includes('edit') || btnText.includes('setting') || btnText.includes('...') ||
                ariaLabel.includes('edit') || ariaLabel.includes('setting') || ariaLabel.includes('menu') || ariaLabel.includes('more') ||
                title.includes('edit') || title.includes('setting') || title.includes('menu') ||
                className.includes('edit') || className.includes('setting') || className.includes('menu') || className.includes('more') ||
                (btn.querySelector('svg') && btnText.length < 5)) {
              console.log('✅ Clicking action button');
              btn.click();
              return { success: true, method: 'action button click', buttonInfo: { text: btnText, ariaLabel, title, className } };
            }
          }
          
          console.log('No action button found, clicking row directly');
          row.click();
          return { success: true, method: 'row click' };
        }, account.email);
        
        console.log(`Click result for ${account.email}:`, JSON.stringify(clickResult));
        
        if (!clickResult.success) {
          results.push({ email: account.email, success: false, error: clickResult.error });
          failCount++;
          continue;
        }
        
        console.log('Waiting for drawer to open...');
        await wait(4000);

        const drawerScreenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        console.log('Drawer screenshot length:', drawerScreenshot.length);
        }

        const tabClickResult = await page.evaluate(() => {
          console.log('Searching for Signature tab/button on entire page first...');
          
          const allButtons = document.querySelectorAll('button, [role="tab"], a, div[role="button"], span');
          console.log(`Total buttons/tabs on page: ${allButtons.length}`);
          
          const signatureElements = Array.from(allButtons).filter(el => {
            const text = el.textContent.trim();
            const visible = el.offsetParent !== null;
            const isSignature = text.toLowerCase() === 'signature' || text === 'Signature';
            if (isSignature && visible) {
              console.log(`Found visible Signature element: tagName=${el.tagName}, text="${text}", className=${el.className.substring(0, 50)}`);
            }
            return visible && isSignature;
          });
          
          console.log(`Found ${signatureElements.length} visible "Signature" elements on page`);
          
          if (signatureElements.length > 0) {
            console.log('Clicking first Signature element');
            signatureElements[0].click();
            return { success: true, method: 'page-wide search', tabText: signatureElements[0].textContent.trim() };
          }
          
          console.log('No Signature button found on page, looking for drawer...');
          
          const drawerSelectors = [
            '[class*="drawer"]',
            '[class*="Drawer"]', 
            '[class*="panel"]',
            '[class*="Panel"]',
            '[class*="MuiDrawer"]',
            'aside',
            '[role="dialog"]',
            '[role="complementary"]'
          ];
          
          let drawer = null;
          let drawerMethod = null;
          
          for (const selector of drawerSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 100) {
                drawer = el;
                drawerMethod = selector;
                console.log(`Found drawer with ${selector}`);
                break;
              }
            }
            if (drawer) break;
          }
          
          if (!drawer) {
            return { success: false, error: 'No Signature button or drawer found' };
          }
          
          console.log('Drawer HTML preview:', drawer.innerHTML.substring(0, 500));
          
          return { success: false, error: 'Signature tab not found', drawerMethod };
        });
        
        console.log('Tab click result:', JSON.stringify(tabClickResult));
        
        if (!tabClickResult.success) {
          results.push({ email: account.email, success: false, error: tabClickResult.error });
          failCount++;
          continue;
        }
        
        console.log('Waiting for signature tab content...');
        await wait(2000);

        const insertResult = await page.evaluate((signature) => {
          console.log('Looking for signature editor...');
          
          let editor = null;
          
          const contentEditables = document.querySelectorAll('div[contenteditable="true"], [contenteditable="true"]');
          console.log(`Found ${contentEditables.length} contenteditable elements`);
          
          for (const el of contentEditables) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const visible = style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           el.offsetParent !== null &&
                           rect.height > 20;
            console.log(`Contenteditable: visible=${visible}, height=${rect.height}, tag=${el.tagName}, class=${el.className.substring(0, 50)}`);
            
            if (visible) {
              editor = el;
              break;
            }
          }
          
          if (!editor) {
            console.log('No visible contenteditable found, trying textareas...');
            const textareas = document.querySelectorAll('textarea');
            console.log(`Found ${textareas.length} textareas`);
            
            for (const el of textareas) {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const visible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             el.offsetParent !== null &&
                             rect.height > 20;
              console.log(`Textarea: visible=${visible}, height=${rect.height}, class=${el.className.substring(0, 50)}`);
              
              if (visible) {
                editor = el;
                break;
              }
            }
          }
          
          if (!editor) {
            console.log('No textarea found, checking for iframes...');
            const iframes = document.querySelectorAll('iframe');
            console.log(`Found ${iframes.length} iframes`);
            
            for (let i = 0; i < iframes.length; i++) {
              const iframe = iframes[i];
              console.log(`Checking iframe ${i}: src=${iframe.src}, id=${iframe.id}, class=${iframe.className}`);
              
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeBody = iframeDoc.body;
                console.log(`Iframe ${i} body: contentEditable=${iframeBody.isContentEditable}, innerHTML length=${iframeBody.innerHTML.length}`);
                
                if (iframeBody && (iframeBody.isContentEditable || iframeBody.contentEditable === 'true')) {
                  console.log(`Found contenteditable iframe ${i} body`);
                  editor = iframeBody;
                  break;
                }
              } catch (e) {
                console.log(`Could not access iframe ${i}:`, e.message);
              }
            }
          }
          
          if (!editor) {
            const allElements = document.querySelectorAll('*');
            let editableCount = 0;
            for (const el of allElements) {
              if (el.isContentEditable || el.contentEditable === 'true') {
                editableCount++;
                console.log(`Editable element: tag=${el.tagName}, class=${el.className.substring(0, 50)}, visible=${el.offsetParent !== null}`);
              }
            }
            console.log(`Total editable elements found: ${editableCount}`);
            
            return { success: false, error: 'No editor elements found' };
          }
          
          console.log(`Using editor: ${editor.tagName}, className: ${editor.className ? editor.className.substring(0, 50) : 'N/A'}`);
          
          if (editor.tagName === 'TEXTAREA') {
            editor.value = '';
          } else {
            editor.innerHTML = '';
          }
          
          editor.focus();
          
          if (editor.tagName === 'TEXTAREA') {
            editor.value = signature;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            editor.dispatchEvent(new Event('blur', { bubbles: true }));
          } else {
            editor.innerHTML = signature;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            editor.dispatchEvent(new Event('blur', { bubbles: true }));
          }
          
          console.log(`After insert, editor content length: ${editor.innerHTML ? editor.innerHTML.length : editor.value ? editor.value.length : 0}`);
          
          return { success: true, editorType: editor.tagName };
        }, account.signature);
        
        console.log(`Signature insert result:`, JSON.stringify(insertResult));
        
        if (!insertResult.success) {
          results.push({ email: account.email, success: false, error: insertResult.error || 'Could not insert signature' });
          failCount++;
          await page.goto('https://reply.io/settings/email-accounts', { waitUntil: 'networkidle0', timeout: 60000 });
          await wait(2000);
          continue;
        }
        
        await wait(500);
        
        const signatureVisible = await page.evaluate(() => {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              const content = iframeDoc.body.innerHTML;
              if (content && content.length > 10) {
                return { visible: true, content: content.substring(0, 200) };
              }
            } catch (e) {
            }
          }
          
          const editables = document.querySelectorAll('[contenteditable="true"]');
          for (const el of editables) {
            if (el.innerHTML && el.innerHTML.length > 10) {
              return { visible: true, content: el.innerHTML.substring(0, 200) };
            }
          }
          
          return { visible: false, content: '' };
        });
        console.log('Signature visibility check:', JSON.stringify(signatureVisible));
        
        await page.evaluate(() => {
          const signatureTab = Array.from(document.querySelectorAll('*')).find(el => 
            el.textContent.trim() === 'Signature' && el.tagName === 'BUTTON'
          );
          if (signatureTab) {
            signatureTab.click();
          }
        });
        
        await wait(1000);

        const saveResult = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          console.log(`Found ${buttons.length} buttons`);
          
          const buttonInfo = buttons.map(btn => ({
            text: btn.textContent.trim().toLowerCase(),
            className: btn.className,
            disabled: btn.disabled,
            visible: btn.offsetParent !== null
          }));
          console.log('Button info:', JSON.stringify(buttonInfo));
          
          const saveBtn = buttons.find(btn => {
            const text = btn.textContent.toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            return btn.offsetParent !== null && 
                   !btn.disabled && 
                   (text.includes('save') || text.includes('update') || 
                    ariaLabel.includes('save') || ariaLabel.includes('update'));
          });
          
          if (saveBtn) {
            console.log('Found save button:', saveBtn.textContent.trim());
            saveBtn.click();
            return { success: true, buttonText: saveBtn.textContent.trim() };
          }
          
          console.log('No save button found');
          return { success: false, error: 'Save button not found' };
        });
        
        console.log(`Save button click result:`, JSON.stringify(saveResult));
        
        if (saveResult.success) {
          await wait(2000);
          
          const verifyResult = await page.evaluate(() => {
            const notifications = document.body.innerText.toLowerCase();
            const hasSuccess = notifications.includes('saved') || notifications.includes('success') || notifications.includes('updated');
            
            let signatureStillPresent = false;
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const content = iframeDoc.body.innerHTML;
                if (content && content.length > 50) {
                  signatureStillPresent = true;
                  break;
                }
              } catch (e) {
              }
            }
            
            return { hasSuccessMessage: hasSuccess, signaturePresent: signatureStillPresent };
          });
          
          console.log('Save verification:', JSON.stringify(verifyResult));
          console.log(`✅ Successfully updated signature for ${account.email}`);
          results.push({ email: account.email, success: true, verification: verifyResult });
          successCount++;
        } else {
          console.log(`❌ Could not save signature for ${account.email}: ${saveResult.error}`);
          results.push({ email: account.email, success: false, error: saveResult.error || 'Could not save' });
          failCount++;
        }

        console.log(`Completed processing ${account.email}. Moving to next account...`);
        await wait(500);

      } catch (error) {
        console.error(`Error processing ${account.email}:`, error.message);
        console.error('Error stack:', error.stack);
        results.push({ email: account.email, success: false, error: error.message });
        failCount++;
        
        if (i < accounts.length - 1) {
          console.log('Attempting to recover for next account...');
          await wait(2000);
        }
      }
    }

    console.log(`Processing complete. Success: ${successCount}, Failed: ${failCount}`);
    console.log('Results:', JSON.stringify(results, null, 2));
    
    const summary = {
      total: accounts.length,
      successful: successCount,
      failed: failCount,
      successRate: accounts.length > 0 ? ((successCount / accounts.length) * 100).toFixed(2) + '%' : '0%',
      processingTime: 'See CloudWatch logs for execution duration'
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Signature automation completed',
        results: results,
        summary: summary
      })
    };

  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
