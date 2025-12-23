#!/usr/bin/env bash

# Reply.io Signature Automation - Lambda Deployment
# Compatible with all shells

set -e

# Configuration
export AWS_PROFILE="bla"
export AWS_DEFAULT_REGION="us-east-1"
FUNCTION_NAME="replyio-signature-automation"
REGION="us-east-1"
RUNTIME="nodejs22.x"

# Get Chromium Layer ARN for the region
get_chromium_layer() {
    case "$1" in
        us-east-1)      echo "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:45" ;;
        us-east-2)      echo "arn:aws:lambda:us-east-2:764866452798:layer:chrome-aws-lambda:45" ;;
        us-west-1)      echo "arn:aws:lambda:us-west-1:764866452798:layer:chrome-aws-lambda:45" ;;
        us-west-2)      echo "arn:aws:lambda:us-west-2:764866452798:layer:chrome-aws-lambda:45" ;;
        eu-west-1)      echo "arn:aws:lambda:eu-west-1:764866452798:layer:chrome-aws-lambda:45" ;;
        eu-west-2)      echo "arn:aws:lambda:eu-west-2:764866452798:layer:chrome-aws-lambda:45" ;;
        eu-central-1)   echo "arn:aws:lambda:eu-central-1:764866452798:layer:chrome-aws-lambda:45" ;;
        ap-northeast-1) echo "arn:aws:lambda:ap-northeast-1:764866452798:layer:chrome-aws-lambda:45" ;;
        ap-southeast-1) echo "arn:aws:lambda:ap-southeast-1:764866452798:layer:chrome-aws-lambda:45" ;;
        ap-southeast-2) echo "arn:aws:lambda:ap-southeast-2:764866452798:layer:chrome-aws-lambda:45" ;;
        *)              echo "" ;;
    esac
}

CHROMIUM_LAYER_ARN=$(get_chromium_layer "$REGION")

if [ -z "$CHROMIUM_LAYER_ARN" ]; then
    echo "❌ No public Chromium layer available for region $REGION"
    echo "Available regions: us-east-1, us-east-2, us-west-1, us-west-2, eu-west-1, eu-west-2, eu-central-1, ap-northeast-1, ap-southeast-1, ap-southeast-2"
    exit 1
fi

echo "=========================================="
echo "Reply.io Lambda Deployment Script"
echo "=========================================="
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Region: $REGION"
echo "Function Name: $FUNCTION_NAME"
echo "Chromium Layer: $CHROMIUM_LAYER_ARN"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed."
    exit 1
fi

# Verify AWS profile
if ! aws configure list-profiles 2>/dev/null | grep -q "^${AWS_PROFILE}$"; then
    echo "❌ AWS profile '${AWS_PROFILE}' not found."
    echo "Available profiles:"
    aws configure list-profiles
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
    "puppeteer-core": "^10.4.0"
  }
}
EOF

# Install puppeteer-core only (tiny package)
echo "Installing puppeteer-core..."
npm install --production --silent
echo "✓ Dependencies installed"

# Create Lambda function
cat > index.js << 'EOF'
const chromium = require('chrome-aws-lambda');
const puppeteer = chromium.puppeteer;

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
            replyioEmail: 'string - Your Reply.io login email',
            replyioPassword: 'string - Your Reply.io password',
            accounts: '[{email: string, signature: string}]'
          },
          example: {
            replyioEmail: 'admin@company.com',
            replyioPassword: 'your-password',
            accounts: [
              { email: 'sales@company.com', signature: '<p>Best regards,<br>John</p>' }
            ]
          }
        })
      };
    }

    console.log(`Processing ${accounts.length} accounts...`);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    console.log('Logging in to Reply.io...');
    await page.goto('https://reply.io/login', { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.type('input[type="email"]', replyioEmail, { delay: 100 });
    await page.type('input[type="password"]', replyioPassword, { delay: 100 });
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    ]);
    
    console.log('Login successful');

    await page.goto('https://reply.io/settings/email-accounts', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    await page.waitForTimeout(3000);

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
        
        await page.waitForTimeout(2000);

        await page.evaluate(() => {
          const signatureElements = Array.from(document.querySelectorAll('*'));
          const sigEl = signatureElements.find(el => 
            el.textContent.toLowerCase().includes('signature') &&
            (el.tagName === 'BUTTON' || el.tagName === 'A' || el.role === 'tab')
          );
          if (sigEl) sigEl.click();
        });
        
        await page.waitForTimeout(1500);

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
          await page.waitForTimeout(2000);
          continue;
        }
        
        await page.waitForTimeout(1500);

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
          await page.waitForTimeout(3000);
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
        await page.waitForTimeout(2000);

      } catch (error) {
        results.push({ email: account.email, success: false, error: error.message });
        failCount++;
        
        try {
          await page.goto('https://reply.io/settings/email-accounts', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
          });
          await page.waitForTimeout(2000);
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
echo "✓ Deployment package created"

# Create IAM role
echo ""
echo "Setting up IAM role..."
ROLE_NAME="${FUNCTION_NAME}-role"

if aws iam get-role --role-name $ROLE_NAME 2>/dev/null; then
    echo "✓ IAM role already exists"
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
else
    cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

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
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --output text > /dev/null
    
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 300 \
        --memory-size 3008 \
        --ephemeral-storage Size=2048 \
        --layers $CHROMIUM_LAYER_ARN \
        --output text > /dev/null
    
    echo "✓ Lambda function updated"
else
    echo "Creating new function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime $RUNTIME \
        --role $ROLE_ARN \
        --handler index.handler \
        --zip-file fileb://function.zip \
        --timeout 300 \
        --memory-size 3008 \
        --ephemeral-storage Size=2048 \
        --layers $CHROMIUM_LAYER_ARN \
        --region $REGION \
        --output text > /dev/null
    
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
echo "    \"replyioEmail\": \"your-replyio-email@company.com\","
echo "    \"replyioPassword\": \"your-password\","
echo "    \"accounts\": [{"
echo "      \"email\": \"sales1@company.com\","
echo "      \"signature\": \"<p>Best regards,<br><strong>John Doe</strong></p>\""
echo "    }]"
echo "  }'"
echo ""
echo "🔧 For n8n - HTTP Request Node:"
echo "   Method: POST"
echo "   URL: $API_ENDPOINT"
echo "   Body: {\"replyioEmail\": \"...\", \"replyioPassword\": \"...\", \"accounts\": [...]}"
echo ""
echo "📊 AWS Console:"
echo "   Lambda: https://console.aws.amazon.com/lambda/home?region=${REGION}#/functions/${FUNCTION_NAME}"
echo ""