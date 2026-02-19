const clientInfo = $('Merge Credential Info').first().json;
const extractInfo = $('Extract Client Info').first().json;
const items = $input.all();

const githubOwner = extractInfo.github_owner;
const githubRepo = extractInfo.github_repo;
const githubRawBase = `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/main`;

const jsFileCache = {};

async function fetchJsFile(filePath) {
  if (jsFileCache[filePath]) {
    return jsFileCache[filePath];
  }
  
  const url = `${githubRawBase}/${filePath}`;
  console.log(`📥 Fetching JS file: ${url}`);
  
  try {
    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: url,
      returnFullResponse: false
    });
    jsFileCache[filePath] = response;
    return response;
  } catch (error) {
    console.error(`❌ Failed to fetch ${filePath}: ${error.message}`);
    throw new Error(`Failed to fetch JS file: ${filePath}`);
  }
}

function findInjectPlaceholders(str) {
  const regex = /\{\{INJECT:([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(str)) !== null) {
    matches.push({ placeholder: match[0], path: match[1] });
  }
  return matches;
}

const results = [];
for (const item of items) {
  const base64Content = item.json.content;
  const fileName = item.json.name;

  let jsonContent = Buffer.from(base64Content, 'base64').toString('utf8');
  
  const placeholders = findInjectPlaceholders(jsonContent);
  console.log(`📋 Found ${placeholders.length} JS injection placeholders in ${fileName}`);
  
  for (const { placeholder, path } of placeholders) {
    const jsContent = await fetchJsFile.call(this, path);
    const escapedJs = jsContent
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    jsonContent = jsonContent.replace(placeholder, escapedJs);
    console.log(`✅ Injected ${path}`);
  }
  
  let workflow = JSON.parse(jsonContent);

  let templateKey = 'unknown';
  if (fileName.includes('phase1')) templateKey = 'phase1';
  else if (fileName.includes('phase2')) templateKey = 'phase2';
  else if (fileName.includes('phase3')) templateKey = 'phase3';
  else if (fileName.includes('orchestrator')) templateKey = 'orchestrator';

  const clientIdLower = clientInfo.client_id.toLowerCase();
  const clientIdUpper = clientInfo.client_id.toUpperCase().replace(/-/g, '_');
  workflow.name = `${clientInfo.client_name} - ${workflow.name.replace(/^.*? - /, '')}`;

  workflow.nodes = workflow.nodes.map(node => {
    if (node.parameters) {
      let params = JSON.stringify(node.parameters);
      params = params.replace(/\{\{CLIENT_ID\}\}/g, clientIdLower);
      params = params.replace(/\{\{CLIENT_NAME\}\}/g, clientInfo.client_name);
      params = params.replace(/\$vars\.CLIENT_REPLY_API_KEY/g, `$vars.${clientIdUpper}_REPLY_API_KEY`);
      params = params.replace(/\$vars\.CLIENT_CLICKUP_API_KEY/g, `$vars.${clientIdUpper}_CLICKUP_API_KEY`);
      node.parameters = JSON.parse(params);
    }
    
    if (node.credentials) {
      for (const [key, value] of Object.entries(node.credentials)) {
        if (value.id === '{{CLICKUP_CREDENTIAL_ID}}' || value.name === '{{CLICKUP_CREDENTIAL_NAME}}') {
          value.id = clientInfo.clickup_credential_id;
          value.name = clientInfo.clickup_credential_name;
        }
        if (value.id === '{{REPLY_CREDENTIAL_ID}}' || value.name === '{{REPLY_CREDENTIAL_NAME}}') {
          value.id = clientInfo.reply_credential_id;
          value.name = clientInfo.reply_credential_name;
        }
      }
    }
    
    return node;
  });

  delete workflow.id;

  results.push({
    json: {
      template_key: templateKey,
      file_name: fileName,
      workflow: workflow,
      client_id: clientInfo.client_id,
      client_name: clientInfo.client_name,
      js_files_injected: placeholders.length
    }
  });
}

return results;