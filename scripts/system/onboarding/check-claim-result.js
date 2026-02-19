const data = $input.first().json;
const claimed = data.claimed === true;

return [{
  json: {
    ...data,
    claimSuccess: claimed
  }
}];