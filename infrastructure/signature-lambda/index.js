/**
 * Reply.io Signature Automation Lambda
 * 
 * This Lambda automates updating email signatures in Reply.io UI.
 * 
 * NEW: Supports fetching credentials from AWS Secrets Manager using client_id
 * LEGACY: Also supports direct replyioEmail/replyioPassword for backward compatibility
 * 
 * Based on the original replyio-signature-automation Lambda with:
 * - AWS Secrets Manager integration for secure credential retrieval
 * - client_id parameter to identify which client's credentials to use
 * - Backward compatibility with direct credential passing
 */

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
        result: JSON.stringify(data.result)
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
    
    // NEW: Accept client_id to fetch credentials from Secrets Manager
    const { client_id, accounts, async: asyncMode, webhookUrl } = body;
    
    // Also support legacy mode with direct credentials (for backward compatibility)
    let { replyioEmail, replyioPassword } = body;
    
    console.log('Parsed parameters:', { 
      client_id: client_id || 'not provided',
      replyioEmail: replyioEmail ? 'direct (legacy)' : 'from secrets',
      replyioPassword: replyioPassword ? '***' : undefined, 
      accounts: accounts ? `${accounts.length} accounts` : undefined,
      async: asyncMode,
      webhookUrl: webhookUrl ? 'provided' : 'not provided'
    });
    
    // If client_id is provided, fetch credentials from Secrets Manager
    if (client_id && (!replyioEmail || !replyioPassword)) {
      console.log(`Fetching credentials from AWS Secrets Manager for client: ${client_id}`);
      try {
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
      } catch (secretsError) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Failed to fetch credentials from Secrets Manager',
            client_id,
            message: secretsError.message
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
    // Note: We CANNOT return 202 early - Lambda will terminate
    // So we accept the API Gateway timeout and use webhook for results
    if (asyncMode === true) {
      console.log('Async mode enabled - processing will complete and send webhook');
      console.log('Note: API Gateway may timeout (503) but Lambda continues processing');
      
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

    // Synchronous processing (original behavior)
    console.log('Starting synchronous processing...');
    const result = await processSignatures(replyioEmail, replyioPassword, accounts);
    return result;

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

// ============================================================
// ORIGINAL processSignatures FUNCTION (UNCHANGED)
// All the sophisticated Puppeteer automation logic below
// ============================================================

async function processSignatures(replyioEmail, replyioPassword, accounts) {
  let browser = null;
  
  try {
    console.log(`Processing ${accounts.length} accounts...`);

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
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Enhanced anti-detection
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock chrome property
      window.chrome = {
        runtime: {},
      };
      
      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Override the automation detection
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
    
    // Navigate directly to the email accounts settings page
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
    
    // Take screenshot for debugging
    const screenshot = await page.screenshot({ encoding: 'base64' });
    console.log('Screenshot taken, length:', screenshot.length);
    
    // Check if we're on a login page or the email accounts page
    const isLoginPage = currentUrl.includes('/login') || 
                        pageContent.toLowerCase().includes('sign in') ||
                        pageContent.toLowerCase().includes('log in');
    
    console.log('Is login page:', isLoginPage);
    
    if (!isLoginPage) {
      console.log('✅ Already on email accounts page or authenticated area!');
      // Continue to email account processing
    } else {
      console.log('🔐 On login page, attempting to authenticate...');
    
    // Check for CAPTCHA or blocking
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
    
    // Try multiple selectors for email input
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
    
    // If still not found, try to find by evaluating visible inputs
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
    
    // Find password input
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
        // Continue to next selector
      }
    }
    
    // Try finding by text content if selectors failed
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
    
    // Navigate to email accounts page after login
    await page.goto('https://run.reply.io/Dashboard/Material#/settings/email-accounts/', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await wait(3000);
    }
    
    // Now we should be on the email accounts page
    console.log('Current URL:', page.url());
    console.log('Processing email accounts...');

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`[${i + 1}/${accounts.length}] Processing ${account.email}...`);
      
      try {
        // If accountId is provided, navigate directly to the account edit page
        if (account.accountId) {
          console.log(`Navigating directly to account ${account.accountId} edit page...`);
          const accountUrl = `https://run.reply.io/Dashboard/Material#/settings/email-accounts/${account.accountId}/other/edit`;
          await page.goto(accountUrl, { waitUntil: 'networkidle0', timeout: 60000 });
          await wait(1500);
          
          console.log(`Navigated to: ${page.url()}`);
          
          // Screenshot removed for performance - only taken on errors
        } else {
          // Legacy path: search for account on main page and click it
          console.log(`No accountId provided, searching for ${account.email} on page...`);
        
          // Take a screenshot of the email accounts page
          const emailAccountsScreenshot = await page.screenshot({ encoding: 'base64' });
          console.log(`Email accounts page screenshot length: ${emailAccountsScreenshot.length}`);
          
          // Get page content for debugging
          const pageText = await page.evaluate(() => document.body.innerText);
          console.log(`Page text preview (first 500 chars): ${pageText.substring(0, 500)}`);
          
          // Check all text elements on page
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
        
        // Try to find and click the account with detailed logging
        const clickResult = await page.evaluate((email) => {
          const elements = Array.from(document.querySelectorAll('*'));
          const accountEl = elements.find(el => el.textContent.trim() === email || el.textContent.includes(email));
          
          if (!accountEl) {
            return { success: false, error: 'Could not find element with email text' };
          }
          
          console.log('Found element with email:', accountEl.tagName, accountEl.className);
          
          // Try different parent containers
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
            // Try clicking the element directly
            console.log('No row found, trying to click element directly');
            accountEl.click();
            return { success: true, method: 'direct element click' };
          }
          
          const row = possibleRows[0];
          console.log('Using row:', row.tagName, row.className);
          
          // Look for ALL interactive elements, not just buttons
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
            
            // Look for edit/settings/menu buttons
            if (btnText.includes('edit') || btnText.includes('setting') || btnText.includes('...') ||
                ariaLabel.includes('edit') || ariaLabel.includes('setting') || ariaLabel.includes('menu') || ariaLabel.includes('more') ||
                title.includes('edit') || title.includes('setting') || title.includes('menu') ||
                className.includes('edit') || className.includes('setting') || className.includes('menu') || className.includes('more') ||
                (btn.querySelector('svg') && btnText.length < 5)) { // SVG icon button
              console.log('✅ Clicking action button');
              btn.click();
              return { success: true, method: 'action button click', buttonInfo: { text: btnText, ariaLabel, title, className } };
            }
          }
          
          // Try clicking the row itself
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
        
        // Wait for drawer to open
        console.log('Waiting for drawer to open...');
        await wait(4000);

        // Take screenshot after clicking to see drawer
        const drawerScreenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        console.log('Drawer screenshot length:', drawerScreenshot.length);
        } // End of else block (legacy path)

        // Now click Signature tab (works for both direct navigation and legacy path)
        // Detect drawer and click Signature tab
        const tabClickResult = await page.evaluate(() => {
          console.log('Searching for Signature tab/button on entire page first...');
          
          // Strategy 1: Search entire page for any visible "Signature" button/tab FIRST
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
          
          // Strategy 2: If no Signature button found, look for drawer and search within it
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
        
        // Wait for signature tab content to load
        console.log('Waiting for signature tab content...');
        await wait(2000);

        // Try to find signature editor and insert signature
        const insertResult = await page.evaluate((signature) => {
          console.log('Looking for signature editor...');
          
          // Look for contenteditable div or textarea - try multiple strategies
          let editor = null;
          
          // Strategy 1: Look for any contenteditable that's visible
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
          
          // Strategy 2: Look for textarea
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
          
          // Strategy 3: Look for iframe (rich text editor)
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
            // Log all elements for debugging
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
          
          // Clear any existing content first
          if (editor.tagName === 'TEXTAREA') {
            editor.value = '';
          } else {
            editor.innerHTML = '';
          }
          
          // Focus the editor first
          editor.focus();
          
          // Insert the signature
          if (editor.tagName === 'TEXTAREA') {
            editor.value = signature;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            editor.dispatchEvent(new Event('blur', { bubbles: true }));
          } else {
            editor.innerHTML = signature;
            // Trigger more events for contenteditable
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
        
        // Screenshot removed for performance
        await wait(500);
        
        // Check if signature is actually visible in the editor
        const signatureVisible = await page.evaluate(() => {
          // Check all iframes
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              const content = iframeDoc.body.innerHTML;
              if (content && content.length > 10) {
                return { visible: true, content: content.substring(0, 200) };
              }
            } catch (e) {
              // Can't access iframe
            }
          }
          
          // Check contenteditable divs
          const editables = document.querySelectorAll('[contenteditable="true"]');
          for (const el of editables) {
            if (el.innerHTML && el.innerHTML.length > 10) {
              return { visible: true, content: el.innerHTML.substring(0, 200) };
            }
          }
          
          return { visible: false, content: '' };
        });
        console.log('Signature visibility check:', JSON.stringify(signatureVisible));
        
        // Click somewhere outside the editor to trigger blur/save
        await page.evaluate(() => {
          const signatureTab = Array.from(document.querySelectorAll('*')).find(el => 
            el.textContent.trim() === 'Signature' && el.tagName === 'BUTTON'
          );
          if (signatureTab) {
            signatureTab.click(); // Click the tab itself to blur the editor
          }
        });
        
        await wait(1000);

        // Find and click save button
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
          await wait(2000); // Wait for save to complete
          
          // Verify signature was saved by checking if still in editor or for success message
          const verifyResult = await page.evaluate(() => {
            // Check for success toast/notification
            const notifications = document.body.innerText.toLowerCase();
            const hasSuccess = notifications.includes('saved') || notifications.includes('success') || notifications.includes('updated');
            
            // Check if signature still in editor
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
                // Can't access
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

        // Don't navigate away - we'll go directly to next account if there is one
        console.log(`Completed processing ${account.email}. Moving to next account...`);
        await wait(500);

      } catch (error) {
        console.error(`Error processing ${account.email}:`, error.message);
        console.error('Error stack:', error.stack);
        results.push({ email: account.email, success: false, error: error.message });
        failCount++;
        
        // Only try to recover if there are more accounts to process
        if (i < accounts.length - 1) {
          console.log('Attempting to recover for next account...');
          await wait(2000);
        }
      }
    }

    console.log(`Processing complete. Success: ${successCount}, Failed: ${failCount}`);
    console.log('Results:', JSON.stringify(results, null, 2));
    
    // Add detailed summary
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
