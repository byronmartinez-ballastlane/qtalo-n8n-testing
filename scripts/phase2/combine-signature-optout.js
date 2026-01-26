// Append opt-out line to signature for ALL items
// Since Reply.io doesn't have separate opt-out endpoint,
// we combine signature + opt-out into final signature
const items = $input.all();

return items.map(item => {
  const data = item.json;
  
  // Combine signature with opt-out line
  const finalSignature = data.signature ? 
    `${data.signature}\n\n${data.opt_out_line}` : 
    data.opt_out_line;
  
  return {
    json: {
      ...data,
      signature: finalSignature
    }
  };
});
