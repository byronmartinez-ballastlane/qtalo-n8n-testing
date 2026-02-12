// Prepare data to pass to Phase 2
// IMPORTANT: Use 'Combine Data' (not 'Extract Configuration') because
// Combine Data has the reconciled multi-domain expected_domains from CSV.
// Extract Configuration only has the single task-level domain hint.
const phase1Result = $('Execute Phase 1').first().json;
const config = $('Combine Data').first().json;

return [{
  json: {
    phase1_results: phase1Result.results || [],
    ...config
  }
}];
