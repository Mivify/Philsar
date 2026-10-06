const dns = require('dns');
const MailChecker = require('mailchecker');

// Catches addresses that can't be real before an account is created. It can't
// prove a specific mailbox exists (Gmail and other providers deliberately hide
// that), so the verification email is still the final proof of ownership.

const resolver = new dns.promises.Resolver({ timeout: 2500, tries: 2 });

// DNS answers that prove the domain can't receive email. Anything else
// (timeouts, server failures) is a lookup problem on our side, not proof the
// address is fake, so it doesn't block the signup.
const NO_MAIL_CODES = ['ENOTFOUND', 'ENODATA', 'EBADNAME'];

const DOMAIN_MESSAGE = "This email address can't receive emails. Please check the part after the @ (for example, gmail.com).";
const DISPOSABLE_MESSAGE = 'Temporary or disposable email addresses are not allowed. Please use your real email address.';

// mailchecker's list of ~56,000 throwaway-inbox domains (mailinator.com, yopmail.com, ...).
// Subdomains count too: anything.mailinator.com is as disposable as mailinator.com.
const isDisposableDomain = (domain) => {
    const blocked = MailChecker.blacklist();
    const labels = domain.split('.');
    for (let i = 0; i < labels.length - 1; i++) {
        if (blocked.has(labels.slice(i).join('.'))) return true;
    }
    return false;
};

// Returns an error message if the address can't be real, otherwise null.
// Expects an address that already passed the format check (EMAIL_REGEX).
const findEmailDomainProblem = async (email) => {
    const domain = String(email).split('@').pop().trim().toLowerCase().replace(/\.$/, '');

    if (isDisposableDomain(domain)) return DISPOSABLE_MESSAGE;

    try {
        // A domain that receives email publishes MX (mail exchanger) records.
        // A "null MX" (RFC 7505, a single record pointing at ".") means it accepts none.
        const records = await resolver.resolveMx(domain);
        const mailServers = records.filter(r => r.exchange && r.exchange !== '.');
        return mailServers.length > 0 ? null : DOMAIN_MESSAGE;
    } catch (error) {
        if (NO_MAIL_CODES.includes(error.code)) return DOMAIN_MESSAGE;
        console.error(`Email domain lookup failed for ${domain} (${error.code}), allowing the address`);
        return null;
    }
};

module.exports = { findEmailDomainProblem };
