#!/usr/bin/env python3
"""
QTalo n8n System Workflow Deployment Script

This script:
1. Reads configuration from environment variables (or .env file)
2. Renders system workflow templates with actual values
3. Optionally deploys to n8n via API

Usage:
    python deploy.py --preview
    python deploy.py --deploy
    python deploy.py --deploy --workflow client-onboarding-v2
"""

import json
import os
import re
import sys
import argparse
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'


def log(msg: str, color: str = ''):
    print(f"{color}{msg}{Colors.END}")


def log_success(msg: str):
    log(f"[SUCCESS] {msg}", Colors.GREEN)


def log_info(msg: str):
    log(f"[INFO] {msg}", Colors.CYAN)


def log_warning(msg: str):
    log(f"[WARNING] {msg}", Colors.WARNING)


def log_error(msg: str):
    log(f"[ERROR] {msg}", Colors.FAIL)


def log_header(msg: str):
    log(f"\n{'='*60}\n{msg}\n{'='*60}", Colors.HEADER + Colors.BOLD)


class ConfigLoader:
    
    def __init__(self):
        self.config: Dict[str, str] = {}
        self._load_from_env()
    
    def _load_from_env(self):
        log_info("Loading configuration from environment variables...")
        
        script_dir = Path(__file__).parent.parent
        env_path = script_dir / ".env"
        
        if env_path.exists():
            load_dotenv(env_path)
            log_info("Loaded .env file")
        
        env_mapping = {
            "N8N_API_URL": "N8N_API_URL",
            "N8N_API_KEY": "N8N_API_KEY",
            "N8N_HOST": "N8N_HOST",
            "N8N_PROJECT_ID": "N8N_PROJECT_ID",
            "GITHUB_CRED_ID": "GITHUB_CREDENTIAL_ID",
            "N8N_CRED_ID": "N8N_CREDENTIAL_ID",
        }
        
        for env_key, config_key in env_mapping.items():
            value = os.getenv(env_key)
            if value:
                self.config[config_key] = value
        
        self.config.setdefault("AWS_API_GATEWAY_URL", os.getenv("AWS_API_GATEWAY_URL", "https://r81lwr2etg.execute-api.us-east-1.amazonaws.com/prod"))
        self.config.setdefault("CLICKUP_API_URL", os.getenv("CLICKUP_API_URL", "https://api.clickup.com/api/v2"))
        self.config.setdefault("GITHUB_OWNER", os.getenv("GITHUB_OWNER", "byronmartinez-ballastlane"))
        self.config.setdefault("GITHUB_REPO", os.getenv("GITHUB_REPO", "qtalo-n8n-testing"))
        self.config.setdefault("CLICKUP_SYSTEM_CREDENTIAL_ID", os.getenv("CLICKUP_SYSTEM_CREDENTIAL_ID", "KQ4DCkxv3kBoRgK1"))
        
        if "N8N_HOST" not in self.config and "N8N_API_URL" in self.config:
            url = self.config["N8N_API_URL"]
            match = re.search(r'https?://([^/]+)', url)
            if match:
                self.config["N8N_HOST"] = match.group(1)
        
        log_success(f"Loaded {len(self.config)} configuration values")
    
    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self.config.get(key, default)
    
    def get_all(self) -> Dict[str, str]:
        return self.config.copy()


class TemplateRenderer:
    
    PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z0-9_]+)\}\}')
    INJECT_PATTERN = re.compile(r'\{\{INJECT:([^}]+)\}\}')
    
    RUNTIME_PLACEHOLDERS = {
        'CLICKUP_CREDENTIAL_ID',
        'CLICKUP_CREDENTIAL_NAME', 
        'REPLY_CREDENTIAL_ID',
        'REPLY_CREDENTIAL_NAME',
        'PHASE1_WORKFLOW_ID',
        'PHASE2_WORKFLOW_ID',
        'PHASE3_WORKFLOW_ID',
        'CLIENT_ID',
        'CLIENT_NAME',
    }
    
    def __init__(self, config: Dict[str, str], base_dir: Optional[Path] = None):
        self.config = config
        self.base_dir = base_dir or Path(__file__).parent.parent
    
    def _escape_js_for_json(self, js_content: str) -> str:
        return (js_content
            .replace('\\', '\\\\')
            .replace('"', '\\"')
            .replace('\n', '\\n')
            .replace('\r', '\\r')
            .replace('\t', '\\t'))
    
    def _inject_js_files(self, content: str) -> str:
        def replace_inject(match):
            file_path = match.group(1)
            full_path = self.base_dir / file_path
            
            if not full_path.exists():
                log_warning(f"JS file not found: {full_path}")
                return match.group(0)
            
            try:
                with open(full_path, 'r') as f:
                    js_content = f.read()
                
                escaped_js = self._escape_js_for_json(js_content)
                log_info(f"    Injected: {file_path}")
                return escaped_js
            except Exception as e:
                log_error(f"Failed to read {file_path}: {e}")
                return match.group(0)
        
        return self.INJECT_PATTERN.sub(replace_inject, content)
    
    def render(self, template_content: str) -> str:
        content = self._inject_js_files(template_content)
        
        def replace_placeholder(match):
            var_name = match.group(1)
            if var_name in self.config:
                return self.config[var_name]
            elif var_name in self.RUNTIME_PLACEHOLDERS:
                return match.group(0)
            else:
                log_warning(f"No value found for placeholder: {{{{{var_name}}}}}")
                return match.group(0)
        
        return self.PLACEHOLDER_PATTERN.sub(replace_placeholder, content)
    
    def find_placeholders(self, content: str) -> list:
        return list(set(self.PLACEHOLDER_PATTERN.findall(content)))
    
    def find_inject_placeholders(self, content: str) -> list:
        return list(set(self.INJECT_PATTERN.findall(content)))


class WorkflowTemplateConverter:
    
    def __init__(self, config: Dict[str, str]):
        self.config = config
        
        self.replacements = [
            (r'https://qtalospace\.app\.n8n\.cloud/api/v1', '{{N8N_API_URL}}'),
            (r'https://qtalospace\.app\.n8n\.cloud', 'https://{{N8N_HOST}}'),
            (r'qtalospace\.app\.n8n\.cloud', '{{N8N_HOST}}'),
            (r'https://r81lwr2etg\.execute-api\.us-east-1\.amazonaws\.com/prod', '{{AWS_API_GATEWAY_URL}}'),
            (r'https://api\.clickup\.com/api/v2', '{{CLICKUP_API_URL}}'),
            (r'"BFIDAvXOISVZh7tb"', '"{{N8N_PROJECT_ID}}"'),
            (r'"id":\s*"Q6oSPWOEORCm73TJ"', '"id": "{{GITHUB_CREDENTIAL_ID}}"'),
            (r'"id":\s*"EaOQcyWDYyvGbbr7"', '"id": "{{N8N_CREDENTIAL_ID}}"'),
            (r'"id":\s*"KQ4DCkxv3kBoRgK1"', '"id": "{{CLICKUP_SYSTEM_CREDENTIAL_ID}}"'),
            (r"'byronmartinez-ballastlane'", "'{{GITHUB_OWNER}}'"),
            (r"'qtalo-n8n-testing'", "'{{GITHUB_REPO}}'"),
            (r'"byronmartinez-ballastlane"', '"{{GITHUB_OWNER}}"'),
            (r'"qtalo-n8n-testing"', '"{{GITHUB_REPO}}"'),
        ]
    
    def convert_to_template(self, workflow_content: str) -> str:
        result = workflow_content
        
        for pattern, replacement in self.replacements:
            result = re.sub(pattern, replacement, result)
        
        return result
    
    def get_replacement_summary(self, original: str, templated: str) -> Dict[str, int]:
        summary = {}
        for pattern, placeholder in self.replacements:
            var_name = placeholder.replace('{{', '').replace('}}', '').replace('"', '')
            original_count = len(re.findall(pattern, original))
            if original_count > 0:
                summary[var_name] = original_count
        return summary


class N8nDeployer:
    
    def __init__(self, api_url: str, api_key: str):
        if not HAS_REQUESTS:
            log_error("requests is required for deployment. Install with: pip install requests")
            sys.exit(1)
        
        self.api_url = api_url.rstrip('/')
        self.headers = {
            "X-N8N-API-KEY": api_key,
            "Content-Type": "application/json"
        }
    
    def get_workflow_by_name(self, name: str) -> Optional[Dict]:
        """Find a workflow by name"""
        try:
            response = requests.get(
                f"{self.api_url}/workflows",
                headers=self.headers
            )
            response.raise_for_status()
            
            workflows = response.json().get('data', [])
            for wf in workflows:
                if wf.get('name') == name:
                    return wf
            return None
        except Exception as e:
            log_error(f"Error fetching workflows: {e}")
            return None
    
    def create_workflow(self, workflow_json: Dict) -> Optional[Dict]:
        """Create a new workflow"""
        try:
            response = requests.post(
                f"{self.api_url}/workflows",
                headers=self.headers,
                json=workflow_json
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            log_error(f"Error creating workflow: {e}")
            return None
    
    def update_workflow(self, workflow_id: str, workflow_json: Dict) -> Optional[Dict]:
        """Update an existing workflow"""
        try:
            response = requests.put(
                f"{self.api_url}/workflows/{workflow_id}",
                headers=self.headers,
                json=workflow_json
            )
            if not response.ok:
                log_error(f"Error updating workflow: {response.status_code} {response.text[:500]}")
                return None
            return response.json()
        except Exception as e:
            log_error(f"Error updating workflow: {e}")
            return None
    
    def _clean_workflow_json(self, workflow_json: Dict) -> Dict:
        """Remove metadata fields that shouldn't be sent in create/update"""
        # Only keep fields that the n8n Cloud API accepts for PUT /workflows/{id}
        # NOTE: versionId must NOT be included — it causes 400 "additional properties"
        allowed_fields = ['name', 'nodes', 'connections', 'settings']
        return {k: v for k, v in workflow_json.items() if k in allowed_fields}
    
    def deploy(self, workflow_json: Dict) -> bool:
        """Deploy a workflow (create or update by name)"""
        name = workflow_json.get('name', 'Unknown')
        
        # Clean the workflow JSON
        workflow_json = self._clean_workflow_json(workflow_json)
        
        # Check if workflow exists
        existing = self.get_workflow_by_name(name)
        
        if existing:
            log_info(f"Updating existing workflow: {name} (ID: {existing['id']})")
            result = self.update_workflow(existing['id'], workflow_json)
            if result:
                log_success(f"Updated workflow: {name}")
                return True
        else:
            log_info(f"Creating new workflow: {name}")
            result = self.create_workflow(workflow_json)
            if result:
                log_success(f"Created workflow: {name} (ID: {result.get('id')})")
                return True
        
        return False


def create_templates(base_dir: Path, config: Dict[str, str]):
    log_header("Creating Templates from System Workflows")
    
    system_dir = base_dir / "system"
    converter = WorkflowTemplateConverter(config)
    
    workflow_files = [
        "client-onboarding-v2.json",
        "status-change-router.json",
        "system-jwt-rotation.json"
    ]
    
    for filename in workflow_files:
        source_path = system_dir / filename
        template_path = system_dir / filename.replace('.json', '.template.json')
        
        if not source_path.exists():
            log_warning(f"Source file not found: {source_path}")
            continue
        
        log_info(f"Converting: {filename}")
        
        with open(source_path, 'r') as f:
            original_content = f.read()
        
        templated_content = converter.convert_to_template(original_content)
        
        summary = converter.get_replacement_summary(original_content, templated_content)
        
        with open(template_path, 'w') as f:
            f.write(templated_content)
        
        log_success(f"Created template: {template_path.name}")
        for var_name, count in summary.items():
            log_info(f"  - {var_name}: {count} replacement(s)")


def preview_templates(base_dir: Path, config: ConfigLoader, output_dir: Optional[Path] = None):
    log_header("Preview Mode - Rendering Templates")
    
    system_dir = base_dir / "system"
    renderer = TemplateRenderer(config.get_all(), base_dir)
    
    if output_dir is None:
        output_dir = base_dir / "deploy" / "rendered"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    template_files = list(system_dir.glob("*.template.json"))
    
    if not template_files:
        log_warning("No template files found. Run with --create-templates first.")
        return
    
    log_info(f"Configuration values:")
    for key, value in config.get_all().items():
        if 'KEY' in key or 'SECRET' in key or 'PASSWORD' in key:
            display_value = value[:8] + '...' if len(value) > 8 else '***'
        else:
            display_value = value
        log_info(f"  {key}: {display_value}")
    
    print()
    
    for template_path in template_files:
        log_info(f"Rendering: {template_path.name}")
        
        with open(template_path, 'r') as f:
            template_content = f.read()
        
        placeholders = renderer.find_placeholders(template_content)
        inject_placeholders = renderer.find_inject_placeholders(template_content)
        
        if placeholders:
            log_info(f"  Config placeholders: {len(placeholders)}")
        if inject_placeholders:
            log_info(f"  JS inject placeholders: {len(inject_placeholders)}")
        
        rendered_content = renderer.render(template_content)
        
        if output_dir and 'system' in str(output_dir):
            output_filename = template_path.name.replace('.template.json', '.json')
        else:
            output_filename = template_path.name.replace('.template.json', '.rendered.json')
        output_path = output_dir / output_filename
        
        with open(output_path, 'w') as f:
            f.write(rendered_content)
        
        try:
            json.loads(rendered_content)
            log_success(f"  Rendered: {output_path}")
        except json.JSONDecodeError as e:
            log_error(f"  Invalid JSON after rendering: {e}")
    
    log_header("Preview Complete")
    log_info(f"Rendered files saved to: {output_dir}")
    log_info("Compare these with the original system/*.json files to verify correctness.")


def deploy_workflows(base_dir: Path, config: ConfigLoader, workflow_filter: Optional[str] = None):
    log_header("Deploy Mode - Uploading to n8n")
    
    api_url = config.get("N8N_API_URL")
    api_key = config.get("N8N_API_KEY")
    
    if not api_url or not api_key:
        log_error("N8N_API_URL and N8N_API_KEY are required for deployment")
        sys.exit(1)
    
    system_dir = base_dir / "system"
    renderer = TemplateRenderer(config.get_all(), base_dir)
    deployer = N8nDeployer(api_url, api_key)
    
    template_files = list(system_dir.glob("*.template.json"))
    
    if workflow_filter:
        template_files = [f for f in template_files if workflow_filter in f.name]
    
    if not template_files:
        log_warning("No template files found to deploy.")
        return
    
    success_count = 0
    for template_path in template_files:
        log_info(f"Processing: {template_path.name}")
        
        with open(template_path, 'r') as f:
            template_content = f.read()
        
        rendered_content = renderer.render(template_content)
        
        try:
            workflow_json = json.loads(rendered_content)
        except json.JSONDecodeError as e:
            log_error(f"  Invalid JSON: {e}")
            continue
        
        if deployer.deploy(workflow_json):
            success_count += 1
    
    log_header("Deployment Complete")
    log_info(f"Successfully deployed {success_count}/{len(template_files)} workflows")


def main():
    parser = argparse.ArgumentParser(
        description="Deploy QTalo n8n system workflows",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python deploy.py --create-templates
  python deploy.py --preview --local
  python deploy.py --preview
  python deploy.py --deploy
  python deploy.py --deploy --workflow client-onboarding
        """
    )
    
    parser.add_argument('--create-templates', action='store_true',
                        help='Convert existing workflows to templates')
    parser.add_argument('--preview', action='store_true',
                        help='Render templates and save to deploy/rendered/')
    parser.add_argument('--deploy', action='store_true',
                        help='Deploy rendered templates to n8n')
    parser.add_argument('--workflow', type=str,
                        help='Filter to specific workflow (partial name match)')
    parser.add_argument('--output', type=str,
                        help='Output directory for rendered files (default: deploy/rendered/)')
    
    args = parser.parse_args()
    
    base_dir = Path(__file__).parent.parent
    output_dir = Path(args.output) if args.output else None
    
    if args.create_templates:
        config_loader = ConfigLoader()
        create_templates(base_dir, config_loader.get_all())
    elif args.preview:
        config_loader = ConfigLoader()
        preview_templates(base_dir, config_loader, output_dir)
    elif args.deploy:
        config_loader = ConfigLoader()
        deploy_workflows(base_dir, config_loader, args.workflow)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()