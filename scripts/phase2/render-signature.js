const items = $input.all();

return items.map(item => {
  const mailbox = item.json;
  const config = mailbox.config || {};
  
  const emailAddress = mailbox.emailAddress || mailbox.email || '';
  const displayName = mailbox.senderName || mailbox.displayName || (emailAddress ? emailAddress.split('@')[0] : 'User');
  const nameParts = displayName.split(/[.\s]+/);
  const firstName = nameParts[0] ? (nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)) : 'User';
  const domain = emailAddress ? (emailAddress.match(/@(.+)$/)?.[1] || '') : '';
  
  const taskCompanyUrl = config.company_url || '';
  const taskDomain = taskCompanyUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  const mailboxCompanyUrl = (domain && taskDomain && domain.toLowerCase() === taskDomain.toLowerCase())
    ? taskCompanyUrl
    : '';
  
  const variables = {
    first_name: firstName,
    last_name: nameParts.slice(1).join(' '),
    full_name: displayName,
    email: emailAddress,
    domain: domain,
    company_name: config.company_name || '',
    company_url: mailboxCompanyUrl,
    phone: config.company_phone || ''
  };
  
  let signature = config.signature_template_plain || '';
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    signature = signature.replace(regex, variables[key]);
  });
  
  return {
    json: {
      mailbox_id: mailbox.id,
      email: emailAddress,
      senderName: mailbox.senderName || displayName,
      signature: signature,
      force_overwrite: config.force_overwrite || false,
      has_existing_signature: !!mailbox.signature,
      config: config
    }
  };
});
