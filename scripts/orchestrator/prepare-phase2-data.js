// Prepare data to pass to Phase 2
const phase1Result = $('Execute Phase 1').first().json;
const config = $('Extract Configuration').first().json;

return [{
  json: {
    phase1_results: phase1Result.results || [],
    ...config
  }
}];
