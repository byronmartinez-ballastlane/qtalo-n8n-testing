const items = $input.all();

return items.map(item => {
  const data = item.json;
  
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
