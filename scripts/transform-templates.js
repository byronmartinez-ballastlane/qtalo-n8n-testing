#!/usr/bin/env node
/**
 * Transform templates to use {{INJECT:path}} placeholders for jsCode
 * This script reads templates and replaces inline jsCode with placeholders
 * that point to external JS files in the scripts/ folder.
 */

const fs = require('fs');
const path = require('path');

// Mapping of template file to code node mappings
const templateMappings = {
  'templates/phase1-import-hygiene.template.json': {
    'prepare-schedule': 'scripts/phase1/prepare-schedule.js',
    'check-schedule-exists': 'scripts/phase1/check-schedule-exists.js',
    'process-schedule-result': 'scripts/phase1/process-schedule-result.js',
    'finalize-schedule': 'scripts/phase1/finalize-schedule.js',
    'skip-set-default': 'scripts/phase1/skip-set-default.js',
    'schedule-complete': 'scripts/phase1/schedule-complete.js',
    'parse-csv': 'scripts/phase1/parse-csv.js',
    'should-skip': 'scripts/phase1/should-skip.js',
    'mark-updated': 'scripts/phase1/mark-updated.js',
    'mark-skipped': 'scripts/phase1/mark-skipped.js',
    'merge-account-data': 'scripts/phase1/merge-account-data.js',
    'filter-retries': 'scripts/phase1/filter-retries.js',
    'merge-retry-results': 'scripts/phase1/merge-retry-results.js',
    'prepare-limits': 'scripts/phase1/prepare-limits.js',
    'merge-limits-result': 'scripts/phase1/merge-limits-result.js',
    'generate-report': 'scripts/phase1/generate-report.js',
    'create-csv': 'scripts/phase1/create-csv.js',
    'prepare-csv-binary': 'scripts/phase1/prepare-csv-binary.js',
    'prepare-comment': 'scripts/phase1/prepare-comment.js',
    'return-mailboxes': 'scripts/phase1/return-mailboxes.js'
  },
  'templates/phase3-standardize.template.json': {
    'process-fields-spec': 'scripts/phase3/process-fields-spec.js',
    'split-fields-to-create': 'scripts/phase3/split-fields-to-create.js',
    'collect-results': 'scripts/phase3/collect-results.js',
    'create-csv-report': 'scripts/phase3/create-csv-report.js',
    'prepare-csv-binary': 'scripts/phase3/prepare-csv-binary.js',
    'prepare-comment': 'scripts/phase3/prepare-comment.js',
    'check-sequences-spec': 'scripts/phase3/check-sequences-spec.js',
    'process-sequences-spec': 'scripts/phase3/process-sequences-spec.js',
    'split-sequences-to-clone': 'scripts/phase3/split-sequences-to-clone.js',
    'prepare-clone-payload': 'scripts/phase3/prepare-clone-payload.js',
    'process-clone-result': 'scripts/phase3/process-clone-result.js',
    'pass-skipped-items': 'scripts/phase3/pass-skipped-items.js',
    'collect-sequence-results': 'scripts/phase3/collect-sequence-results.js',
    'create-sequences-csv': 'scripts/phase3/create-sequences-csv.js',
    'prepare-sequences-csv-binary': 'scripts/phase3/prepare-sequences-csv-binary.js',
    'prepare-sequences-comment': 'scripts/phase3/prepare-sequences-comment.js'
  },
  'templates/main-orchestrator.template.json': {
    'validate-task-id': 'scripts/orchestrator/validate-task-id.js',
    'check-clickup-auth': 'scripts/orchestrator/check-clickup-auth.js',
    'extract-config': 'scripts/orchestrator/extract-config.js',
    'check-csv-exists': 'scripts/orchestrator/check-csv-exists.js',
    'combine-data': 'scripts/orchestrator/combine-data.js',
    'prepare-phase1-comment': 'scripts/orchestrator/prepare-phase1-comment.js',
    'attach-phase1-csv': 'scripts/orchestrator/attach-phase1-csv.js',
    'prepare-phase2-data': 'scripts/orchestrator/prepare-phase2-data.js',
    'prepare-phase3-data': 'scripts/orchestrator/prepare-phase3-data.js',
    'prepare-status-update': 'scripts/orchestrator/prepare-status-update.js'
  }
};

// Process each template
Object.entries(templateMappings).forEach(([templatePath, nodeMappings]) => {
  const fullPath = path.join(process.cwd(), templatePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ Template not found: ${templatePath}`);
    return;
  }
  
  console.log(`\n📄 Processing: ${templatePath}`);
  
  // Read template
  const content = fs.readFileSync(fullPath, 'utf8');
  let workflow = JSON.parse(content);
  
  let replacements = 0;
  
  // Update each code node
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.code' && nodeMappings[node.id]) {
      const scriptPath = nodeMappings[node.id];
      console.log(`  ✅ ${node.id} → {{INJECT:${scriptPath}}}`);
      node.parameters.jsCode = `{{INJECT:${scriptPath}}}`;
      replacements++;
    }
    return node;
  });
  
  // Write updated template
  fs.writeFileSync(fullPath, JSON.stringify(workflow, null, 2));
  console.log(`  📝 Updated ${replacements} code nodes`);
});

console.log('\n✅ All templates transformed!');
