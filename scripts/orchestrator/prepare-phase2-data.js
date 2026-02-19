const phase1Result = $('Execute Phase 1').first().json;
const config = $('Combine Data').first().json;

return [{
  json: {
    phase1_results: phase1Result.results || [],
    ...config
  }
}];
