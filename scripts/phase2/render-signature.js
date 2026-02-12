// Render signature template for ALL mailboxes
const items = $input.all();

return items.map(item => {
  const mailbox = item.json;
  const config = mailbox.config || {};
  
  // Parse name from senderName or emailAddress
  // API fields: id, senderName, emailAddress, signature
  const emailAddress = mailbox.emailAddress || mailbox.email || '';
  const displayName = mailbox.senderName || mailbox.displayName || (emailAddress ? emailAddress.split('@')[0] : 'User');
  const nameParts = displayName.split(/[.\s]+/);
  const firstName = nameParts[0] ? (nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)) : 'User';
  const domain = emailAddress ? (emailAddress.match(/@(.+)$/)?.[1] || '') : '';
  
  // Determine company_url per mailbox:
  // If the mailbox domain matches the task's domain, use the full company_url from ClickUp.
  // Otherwise, use the mailbox's own domain so each signature shows the correct URL.
  const taskCompanyUrl = config.company_url || '';
  const taskDomain = taskCompanyUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  const mailboxCompanyUrl = (domain && taskDomain && domain.toLowerCase() === taskDomain.toLowerCase())
    ? taskCompanyUrl
    : '';
  
  // Template variables
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
  
  // Render signature
  let signature = config.signature_template_plain || '';
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    signature = signature.replace(regex, variables[key]);
  });
  
  // Select random opt-out line
  const optOutLines = config.opt_out_variants || [
    "If you're ready to move on from my emails, just reply.",
    "Not interested? Let me know.",
    "Reply to unsubscribe."
  ];
  const randomOptOut = optOutLines[Math.floor(Math.random() * optOutLines.length)];
  
  return {
    json: {
      mailbox_id: mailbox.id,
      email: emailAddress,
      senderName: mailbox.senderName || displayName,
      signature: signature,
      opt_out_line: randomOptOut,
      force_overwrite: config.force_overwrite || false,
      has_existing_signature: !!mailbox.signature,
      // CRITICAL: Pass config through for downstream nodes (Prepare Lambda Request needs client_id)
      config: config
    }
  };
});
