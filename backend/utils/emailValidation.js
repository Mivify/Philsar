const dns = require('dns');
const MailChecker = require('mailchecker');

// Catches addresses that can't be real before an account is created. The instant
// checks below look at the domain; checkMailbox then asks whether the mailbox
// itself exists. Yahoo and "catch-all" company domains accept every address, so
// for those the verification email is still the final proof of ownership.

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

// --- Mailbox check (Abstract API) ---
// Only the provider's mail server knows whether a mailbox exists, and Railway
// blocks the mail port, so Abstract's email API asks from its own servers.
// Free plan: 100 requests a month (every request counts, even failed ones),
// at most 1 a second. Without ABSTRACT_API_KEY, or while the monthly limit is
// reached, only the built-in checks above run.

const MISSING_MAILBOX_MESSAGE = "This email address doesn't exist. Please check it for typos.";
const FULL_MAILBOX_MESSAGE = "This inbox is full, so it can't receive our verification email. Please free up space or use another address.";

// Abstract has two email APIs (Email Reputation and the older Email Validation)
// with separate keys and reply layouts. Whichever one the key belongs to is found
// on the first check and remembered.
const ABSTRACT_ENDPOINTS = [
    'https://emailreputation.abstractapi.com/v1/',
    'https://emailvalidation.abstractapi.com/v1/',
];
let abstractEndpoint = null;

// Once Abstract says the plan's limit is reached, stop asking (each try would just
// fail) and fall back to the built-in checks; try again every 6 hours in case the
// plan has renewed.
const QUOTA_RETRY_MS = 6 * 60 * 60 * 1000;
let quotaPausedUntil = 0;

const isMailboxCheckEnabled = () => !!process.env.ABSTRACT_API_KEY && Date.now() >= quotaPausedUntil;

const MAILBOX_CACHE_MS = 24 * 60 * 60 * 1000;
// Mailbox checks the sign-up form may trigger per network (IP) per hour, so one
// visitor can't use up the month's 100 free requests
const MAILBOX_CHECKS_PER_HOUR = 5;
const mailboxCache = new Map();
const mailboxChecksInFlight = new Map();
const mailboxBudgets = new Map();

const withinMailboxBudget = (key) => {
    const now = Date.now();
    const budget = mailboxBudgets.get(key);
    if (!budget || budget.resetAt <= now) {
        if (mailboxBudgets.size >= 5000) mailboxBudgets.clear();
        mailboxBudgets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
        return true;
    }
    budget.count += 1;
    return budget.count <= MAILBOX_CHECKS_PER_HOUR;
};

// Reads either reply layout: email_deliverability.status (Email Reputation API)
// or deliverability (Email Validation API).
const readAbstractReply = (data, address) => {
    const status = String(data.email_deliverability?.status ?? data.deliverability ?? '').toLowerCase();
    const detail = data.email_deliverability?.status_detail;
    const disposable = data.email_quality?.is_disposable ?? data.is_disposable_email?.value;
    const catchAll = data.email_quality?.is_catchall ?? data.is_catchall_email?.value;
    const correction = data.suggested_correction ?? data.autocorrect;

    if (disposable === true) return { status: 'rejected', message: DISPOSABLE_MESSAGE };
    if (status === 'deliverable') {
        // A catch-all domain says yes to every address, so that's no proof
        return { status: catchAll === true || detail === 'high_traffic_email' ? 'unknown' : 'exists' };
    }
    if (status === 'undeliverable') {
        if (typeof correction === 'string' && correction.includes('@') && correction.toLowerCase() !== address) {
            return { status: 'rejected', message: `Did you mean ${correction}? Please check the spelling of your email address.`, suggestion: correction };
        }
        if (detail === 'full_mailbox') return { status: 'rejected', message: FULL_MAILBOX_MESSAGE };
        if (detail === 'dns_record_not_found') return { status: 'rejected', message: DOMAIN_MESSAGE };
        if (detail === 'invalid_format') return { status: 'rejected', message: 'Please enter a valid email address' };
        // The mail server couldn't be reached, which may only be temporary
        if (detail === 'unavailable_server') return { status: 'unknown' };
        return { status: 'rejected', message: MISSING_MAILBOX_MESSAGE };
    }
    return { status: 'unknown' };
};

// Never throws: any failure (limit reached, bad key, timeout) is 'unknown', which
// leaves the decision to the built-in checks. Errors are logged without the
// request URL, since it contains the API key.
const askAbstract = async (address) => {
    try {
        for (const endpoint of abstractEndpoint ? [abstractEndpoint] : ABSTRACT_ENDPOINTS) {
            const url = `${endpoint}?api_key=${encodeURIComponent(process.env.ABSTRACT_API_KEY)}&email=${encodeURIComponent(address)}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            // A key for the other email API is "unauthorized" here, so try that one
            if (response.status === 401 && !abstractEndpoint) continue;
            if (response.status === 422 || response.status === 403) {
                quotaPausedUntil = Date.now() + QUOTA_RETRY_MS;
                console.error('Abstract API free-plan limit reached; using only the built-in email checks for the next 6 hours');
                return { status: 'unknown' };
            }
            if (!response.ok) {
                // 401 bad key, 429 more than 1 request a second, 5xx Abstract is down
                console.error(`Mailbox check failed (HTTP ${response.status}), allowing the address`);
                return { status: 'unknown' };
            }
            abstractEndpoint = endpoint;
            return readAbstractReply(await response.json(), address);
        }
        console.error('Abstract API key was rejected by both email APIs (HTTP 401), allowing the address');
        return { status: 'unknown' };
    } catch (error) {
        console.error(`Mailbox check failed (${error.name}), allowing the address`);
        return { status: 'unknown' };
    }
};

// Whether the mailbox itself exists. Returns { status: 'exists' },
// { status: 'rejected', message, suggestion? } or { status: 'unknown' }, and
// 'unknown' never blocks anyone. Pass budgetKey (the visitor's IP) for checks
// anyone can trigger, so one network can't use up the month's free requests.
const checkMailbox = async (email, { budgetKey } = {}) => {
    if (!process.env.ABSTRACT_API_KEY) return { status: 'unknown' };
    const address = String(email).trim().toLowerCase();

    // Answers from before the limit was reached are still good
    const cached = mailboxCache.get(address);
    if (cached && cached.expires > Date.now()) return cached.result;
    // The form's check and the Create Account click can ask at the same moment
    if (mailboxChecksInFlight.has(address)) return mailboxChecksInFlight.get(address);
    if (!isMailboxCheckEnabled()) return { status: 'unknown' };
    if (budgetKey && !withinMailboxBudget(budgetKey)) return { status: 'unknown' };

    const check = askAbstract(address).then(result => {
        if (result.status !== 'unknown') {
            if (mailboxCache.size >= 1000) mailboxCache.clear();
            mailboxCache.set(address, { result, expires: Date.now() + MAILBOX_CACHE_MS });
        }
        mailboxChecksInFlight.delete(address);
        return result;
    });
    mailboxChecksInFlight.set(address, check);
    return check;
};

module.exports = { findEmailDomainProblem, checkMailbox, isMailboxCheckEnabled };
