// Check if claim was successful
const data = $input.first().json;
const claimed = data.claimed === true;

// Return item with explicit claimSuccess flag
return [{
  json: {
    ...data,
    claimSuccess: claimed
  }
}];