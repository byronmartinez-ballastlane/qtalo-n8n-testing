#!/usr/bin/env bash

# Reply.io Signature Automation - Complete Lambda Deployment
set -e

# Configuration
export AWS_PROFILE="bla"
export AWS_DEFAULT_REGION="us-east-1"
FUNCTION_NAME="replyio-signature-automation"
REGION="us-east-1"
RUNTIME="nodejs20.x"

echo "=========================================="
echo "Reply.io Lambda Deployment Script"
echo "=========================================="
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Region: $REGION"
echo "Function Name: $FUNCTION_NAME"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed."
    exit 1
fi

# Verify AWS profile
if ! aws configure list-profiles 2>/dev/null | grep -q "^${AWS_PROFILE}$"; then
    echo "❌ AWS profile '${AWS_PROFILE}' not found."
    exit 1
fi

echo "✓ AWS CLI configured"

# Get Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $ACCOUNT_ID"

# Create project directory
PROJECT_DIR="replyio-lambda-deploy"
echo ""
echo "Creating project in ./$PROJECT_DIR ..."
rm -rf $PROJECT_DIR
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# Create package.json
cat > package.json << 'EOF'
{
  "name": "replyio-signature-automation",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@sparticuz/chromium": "^131.0.0",
    "puppeteer-core": "^23.5.0"
  }
}
EOF

# Install dependencies
echo "Installing dependencies (this will take 2-3 minutes)..."
npm install --production --silent
echo "✓ Dependencies installed"

// Create Lambda function
cat > index.js << 'EOF'
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handler = async (event) => {
  let browser = null;
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    const { replyioEmail, replyioPassword, accounts } = body;
    
    if (!replyioEmail || !replyioPassword || !accounts || !Array.isArray(accounts)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing or invalid parameters',
          required: {
            replyioEmail: 'string',
            replyioPassword: 'string',
            accounts: '[{email: string, signature: string}]'
          }
        })
      };
    }

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
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: true,
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
    });
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    });

    console.log('Logging in to Reply.io...');
    await page.goto('https://reply.io/login', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    // Wait a bit for page to fully load
    await wait(3000);
    
    // Try to find the email input with multiple strategies
    let emailInput = null;
    try {
      emailInput = await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    } catch (e) {
      console.log('Trying alternative selector for email input...');
      emailInput = await page.waitForSelector('input[name="email"], input[id*="email"], input[placeholder*="email"]', { timeout: 5000 });
    }
    
    if (!emailInput) {
      throw new Error('Could not find email input field');
    }
    
    console.log('Found login form, filling credentials...');
    await page.type('input[type="email"], input[name="email"]', replyioEmail, { delay: 100 });
    await page.type('input[type="password"], input[name="password"]', replyioPassword, { delay: 100 });
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    ]);
    
    console.log('Login successful');

    await page.goto('https://reply.io/settings/email-accounts', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    await wait(3000);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`[${i + 1}/${accounts.length}] Processing ${account.email}...`);
      
      try {
        await page.waitForSelector(`text/${account.email}`, { timeout: 10000 });
        
        const clicked = await page.evaluate((email) => {
          const elements = Array.from(document.querySelectorAll('*'));
          const accountEl = elements.find(el => el.textContent.includes(email));
          if (!accountEl) return false;
          
          const row = accountEl.closest('tr, div[role="row"], .account-row');
          if (!row) return false;
          
          const editBtn = row.querySelector('[aria-label*="dit"], [title*="dit"], button.edit, .edit-button');
          if (editBtn) {
            editBtn.click();
            return true;
          }
          
          row.click();
          return true;
        }, account.email);
        
        if (!clicked) {
          results.push({ email: account.email, success: false, error: 'Could not click account' });
          failCount++;
          continue;
        }
        
        await wait(2000);

        await page.evaluate(() => {
          const signatureElements = Array.from(document.querySelectorAll('*'));
          const sigEl = signatureElements.find(el => 
            el.textContent.toLowerCase().includes('signature') &&
            (el.tagName === 'BUTTON' || el.tagName === 'A' || el.role === 'tab')
          );
          if (sigEl) sigEl.click();
        });
        
        await wait(1500);

        const signatureInserted = await page.evaluate((signatureHtml) => {
          const editor = document.querySelector(
            'div[contenteditable="true"], textarea[name*="signature"], .signature-editor'
          );
          
          if (!editor) return false;
          
          if (editor.contentEditable === 'true') {
            editor.focus();
            editor.innerHTML = '';
            editor.innerHTML = signatureHtml;
          } else if (editor.tagName === 'TEXTAREA') {
            editor.value = signatureHtml;
          }
          
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          
          return true;
        }, account.signature);
        
        if (!signatureInserted) {
          results.push({ email: account.email, success: false, error: 'Could not insert signature' });
          failCount++;
          await page.goto('https://reply.io/settings/email-accounts', { waitUntil: 'networkidle2', timeout: 60000 });
          await wait(2000);
          continue;
        }
        
        await wait(1500);

        const saved = await page.evaluate(() => {
          const saveButtons = Array.from(document.querySelectorAll('button'));
          const saveBtn = saveButtons.find(btn => 
            btn.textContent.toLowerCase().includes('save') ||
            btn.textContent.toLowerCase().includes('update')
          );
          if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
            return true;
          }
          return false;
        });
        
        if (saved) {
          await wait(3000);
          results.push({ email: account.email, success: true });
          successCount++;
        } else {
          results.push({ email: account.email, success: false, error: 'Could not save' });
          failCount++;
        }

        await page.goto('https://reply.io/settings/email-accounts', { 
          waitUntil: 'networkidle2',
          timeout: 60000 
        });
        await wait(2000);

      } catch (error) {
        results.push({ email: account.email, success: false, error: error.message });
        failCount++;
        
        try {
          await page.goto('https://reply.io/settings/email-accounts', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
          });
          await wait(2000);
        } catch (e) {
          console.error('Could not recover');
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Signature automation completed',
        results: results,
        summary: {
          total: accounts.length,
          successful: successCount,
          failed: failCount
        }
      })
    };

  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
EOF

echo "✓ Function code created"

# Create deployment package
echo "Creating deployment package..."
zip -r -q function.zip index.js node_modules package.json
PACKAGE_SIZE=$(du -h function.zip | cut -f1)
echo "✓ Deployment package created ($PACKAGE_SIZE)"

# Check size and prepare S3 if needed
SIZE_BYTES=$(stat -f%z function.zip 2>/dev/null || stat -c%s function.zip 2>/dev/null)
NEED_S3=false

if [ "$SIZE_BYTES" -gt 50000000 ]; then
    echo "⚠️  Package is larger than 50MB, will upload via S3..."
    NEED_S3=true
    
    S3_BUCKET="lambda-deploy-${ACCOUNT_ID}-${REGION}"
    if ! aws s3 ls "s3://$S3_BUCKET" 2>/dev/null; then
        echo "Creating S3 bucket: $S3_BUCKET"
        aws s3 mb "s3://$S3_BUCKET" --region $REGION
    fi
    
    echo "Uploading to S3..."
    aws s3 cp function.zip "s3://$S3_BUCKET/replyio-signature-automation.zip"
    S3_KEY="replyio-signature-automation.zip"
fi

# Create IAM role
echo ""
echo "Setting up IAM role..."
ROLE_NAME="${FUNCTION_NAME}-role"

if aws iam get-role --role-name $ROLE_NAME 2>/dev/null; then
    echo "✓ IAM role already exists"
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
else
    cat > trust-policy.json << 'EOFTP'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOFTP

    ROLE_ARN=$(aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file://trust-policy.json \
        --query 'Role.Arn' \
        --output text)
    
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    
    echo "✓ IAM role created"
    echo "  Waiting 10 seconds for role propagation..."
    sleep 10
fi

# Deploy Lambda function
echo ""
echo "Deploying Lambda function..."

if aws lambda get-function --function-name $FUNCTION_NAME 2>/dev/null; then
    echo "Updating existing function..."
    if [ "$NEED_S3" = true ]; then
        aws lambda update-function-code \
            --function-name $FUNCTION_NAME \
            --s3-bucket $S3_BUCKET \
            --s3-key $S3_KEY \
            --output text > /dev/null
    else
        aws lambda update-function-code \
            --function-name $FUNCTION_NAME \
            --zip-file fileb://function.zip \
            --output text > /dev/null
    fi
    
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 300 \
        --memory-size 3008 \
        --ephemeral-storage Size=2048 \
        --output text > /dev/null
    
    echo "✓ Lambda function updated"
else
    echo "Creating new function..."
    if [ "$NEED_S3" = true ]; then
        aws lambda create-function \
            --function-name $FUNCTION_NAME \
            --runtime $RUNTIME \
            --role $ROLE_ARN \
            --handler index.handler \
            --code S3Bucket=$S3_BUCKET,S3Key=$S3_KEY \
            --timeout 300 \
            --memory-size 3008 \
            --ephemeral-storage Size=2048 \
            --region $REGION \
            --output text > /dev/null
    else
        aws lambda create-function \
            --function-name $FUNCTION_NAME \
            --runtime $RUNTIME \
            --role $ROLE_ARN \
            --handler index.handler \
            --zip-file fileb://function.zip \
            --timeout 300 \
            --memory-size 3008 \
            --ephemeral-storage Size=2048 \
            --region $REGION \
            --output text > /dev/null
    fi
    
    echo "✓ Lambda function created"
fi

echo "  Waiting for function to be ready..."
aws lambda wait function-active --function-name $FUNCTION_NAME

# Create API Gateway
echo ""
echo "Setting up API Gateway..."

API_NAME="${FUNCTION_NAME}-api"
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId" --output text 2>/dev/null || echo "")

if [ -z "$API_ID" ] || [ "$API_ID" == "None" ]; then
    echo "Creating new HTTP API..."
    API_ID=$(aws apigatewayv2 create-api \
        --name $API_NAME \
        --protocol-type HTTP \
        --target arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME} \
        --query 'ApiId' \
        --output text)
    echo "✓ API Gateway created"
else
    echo "✓ API Gateway already exists"
fi

# Add Lambda permission
echo "Configuring permissions..."
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    2>/dev/null || echo "  (Permission already exists)"

# Get endpoint
API_ENDPOINT=$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiEndpoint" --output text)

echo "✓ API Gateway configured"

cd ..

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "🔗 API Endpoint:"
echo "   $API_ENDPOINT"
echo ""
echo "📝 Test with curl:"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"replyioEmail\": \"devin@qtalo.com\","
echo "    \"replyioPassword\": \"your-password\","
echo "    \"accounts\": [{"
echo "      \"email\": \"david@n8ntesting.com\","
echo "      \"signature\": \"<p>Best regards,<br><strong>David</strong></p>\""
echo "    }]"
echo "  }'"
echo ""
echo "📊 AWS Console:"
echo "   Lambda: https://console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${FUNCTION_NAME}"
echo ""