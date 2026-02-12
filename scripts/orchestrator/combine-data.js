// Combine CSV content with config
// MULTI-DOMAIN: Extract all unique domains from CSV and reconcile with task domain
const maybeDownloaded = $input.first().json;
const config = $('Check CSV Exists').first().json;

let csvContent = '';

if (config.skip_csv_download) {
  csvContent = '';
} else if (typeof maybeDownloaded === 'string' && maybeDownloaded.length > 0) {
  csvContent = maybeDownloaded;
}

// ============================================================
// MULTI-DOMAIN: Extract unique domains from CSV emails
// ============================================================
let csvDomains = [];
if (csvContent && csvContent.trim()) {
  const lines = csvContent.trim().split('\n');
  if (lines.length > 1) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const emailColIdx = headers.findIndex(h => h === 'email');

    if (emailColIdx >= 0) {
      const domainSet = new Set();
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const email = (values[emailColIdx] || '').toLowerCase();
        const domain = email.split('@')[1];
        if (domain) domainSet.add(domain);
      }
      csvDomains = [...domainSet].sort();
      console.log(`📧 Extracted ${csvDomains.length} unique domain(s) from CSV: ${csvDomains.join(', ')}`);
    }
  }
}

// ============================================================
// DOMAIN RECONCILIATION LOGIC:
// 1. If task has a domain AND it exists in CSV domains → use ALL CSV domains
// 2. If task has a domain but NOT in CSV domains → warn but use ALL CSV domains
// 3. If task has NO domain → use ALL CSV domains (skip domain security check downstream)
// ============================================================
const taskDomain = (config.expected_domains && config.expected_domains.length > 0)
  ? config.expected_domains[0]
  : null;

let finalExpectedDomains = [];
let domainSource = 'none';

if (csvDomains.length > 0) {
  finalExpectedDomains = csvDomains;
  domainSource = 'csv';

  if (taskDomain) {
    if (csvDomains.includes(taskDomain.toLowerCase())) {
      console.log(`✅ Task domain "${taskDomain}" found in CSV domains. Using all ${csvDomains.length} CSV domain(s).`);
      domainSource = 'csv_validated_by_task';
    } else {
      console.warn(`⚠️ Task domain "${taskDomain}" NOT found in CSV domains [${csvDomains.join(', ')}]. Using CSV domains anyway.`);
      domainSource = 'csv_task_mismatch';
    }
  } else {
    console.log(`ℹ️ No task domain set. Using all ${csvDomains.length} CSV domain(s): ${csvDomains.join(', ')}`);
    domainSource = 'csv_no_task_domain';
  }
} else if (taskDomain) {
  // No CSV or no emails in CSV — fall back to task domain
  finalExpectedDomains = [taskDomain];
  domainSource = 'task_only';
  console.log(`ℹ️ No CSV domains available. Using task domain: ${taskDomain}`);
} else {
  console.warn('⚠️ WARNING: No domains from CSV or task. Domain filtering will be skipped.');
  domainSource = 'none';
}

const output = {
  ...config,
  mailbox_csv_content: csvContent,
  data: csvContent,
  // Override expected_domains with the reconciled multi-domain list
  expected_domains: finalExpectedDomains,
  _domain_reconciliation: {
    task_domain: taskDomain,
    csv_domains: csvDomains,
    final_domains: finalExpectedDomains,
    source: domainSource
  }
};

if (!output.opt_out_variants || output.opt_out_variants.length === 0) {
  output.opt_out_variants = [
    "If you're ready to move on from my emails, just reply.",
    "Not interested? Let me know.",
    "Reply to unsubscribe."
  ];
}

console.log(`🔒 Final expected_domains (${domainSource}): ${finalExpectedDomains.join(', ') || 'NONE'}`);

return [{ json: output }];
