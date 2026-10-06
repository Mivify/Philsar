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

// Typo domains like gmaiol.com or gamil.com are often registered on purpose to
// collect misdirected mail, so they pass the DNS check. Anything one typo away
// from these big providers is treated as a misspelling instead.
const POPULAR_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.com.ph', 'hotmail.com', 'outlook.com', 'icloud.com'];
// Real providers that happen to be one letter away from a popular one
const REAL_LOOKALIKES = new Set(['email.com', 'ymail.com', 'mail.com', 'cloud.com']);

// Number of typos between two strings: an extra, missing or wrong letter, or
// two neighbouring letters swapped (gmial), each count as one.
const typoDistance = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
};

// The popular domain this one is probably a misspelling of, or null
const suggestDomain = (domain) => {
    if (POPULAR_DOMAINS.includes(domain) || REAL_LOOKALIKES.has(domain)) return null;
    const name = domain.split('.')[0];
    // Gmail only uses gmail.com, so gmail.co, gmail.com.ph etc. are always typos
    if (name === 'gmail') return 'gmail.com';
    for (const popular of POPULAR_DOMAINS) {
        // Same name with another country ending (yahoo.co.uk, hotmail.fr) can be
        // real, so that's left to the DNS check
        if (name === popular.split('.')[0]) continue;
        if (typoDistance(domain, popular) === 1) return popular;
    }
    return null;
};

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

// Checking while the user types repeats the same domains (every gmail.com
// address), so each answer is kept for 10 minutes. Failed lookups aren't kept.
const mailDomainCache = new Map();
const CACHE_MS = 10 * 60 * 1000;

const domainReceivesMail = async (domain) => {
    const cached = mailDomainCache.get(domain);
    if (cached && cached.expires > Date.now()) return cached.receivesMail;

    let receivesMail;
    try {
        // A domain that receives email publishes MX (mail exchanger) records.
        // A "null MX" (RFC 7505, a single record pointing at ".") means it accepts none.
        const records = await resolver.resolveMx(domain);
        receivesMail = records.some(r => r.exchange && r.exchange !== '.');
    } catch (error) {
        if (!NO_MAIL_CODES.includes(error.code)) {
            console.error(`Email domain lookup failed for ${domain} (${error.code}), allowing the address`);
            return true;
        }
        receivesMail = false;
    }

    if (mailDomainCache.size >= 1000) mailDomainCache.clear();
    mailDomainCache.set(domain, { receivesMail, expires: Date.now() + CACHE_MS });
    return receivesMail;
};

// Returns null if the address could be real, otherwise { message, suggestion? }
// where suggestion is the corrected address for a likely typo.
// Expects an address that already passed the format check (EMAIL_REGEX).
const findEmailDomainProblem = async (email) => {
    const address = String(email).trim();
    const at = address.lastIndexOf('@');
    const localPart = address.slice(0, at);
    const domain = address.slice(at + 1).toLowerCase().replace(/\.$/, '');

    const suggestedDomain = suggestDomain(domain);
    if (suggestedDomain) {
        const suggestion = `${localPart}@${suggestedDomain}`;
        return { message: `Did you mean ${suggestion}? Please check the spelling of your email address.`, suggestion };
    }
    if (isDisposableDomain(domain)) return { message: DISPOSABLE_MESSAGE };
    if (!(await domainReceivesMail(domain))) return { message: DOMAIN_MESSAGE };
    return null;
};

module.exports = { findEmailDomainProblem };
