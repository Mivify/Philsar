const jwt = require('jsonwebtoken');
require('dotenv').config();

// Cloud env-var UIs are inconsistent about preserving real newlines in a
// pasted multi-line value — some flatten it to one line, silently breaking
// PEM parsing (Node's crypto module requires the actual line breaks, not
// just the BEGIN/END markers). Normalizing here means the env var works
// whichever way it was pasted: as real newlines, or as one line with
// literal "\n" escape sequences.
const getPrivateKey = () => {
    const raw = process.env.JAAS_PRIVATE_KEY || '';
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
};

// Temporary, safe-to-expose diagnostics for tracking down env-var formatting
// issues in a deployed environment without ever revealing the key itself —
// only structural facts (length, boilerplate markers, which newline style is
// present). Remove once the deployment issue is confirmed fixed.
const debugPrivateKeyShape = () => {
    const raw = process.env.JAAS_PRIVATE_KEY || '';
    const normalized = getPrivateKey();
    return {
        rawLength: raw.length,
        startsWithBeginMarker: raw.trimStart().startsWith('-----BEGIN'),
        endsWithEndMarker: raw.trimEnd().endsWith('-----'),
        first30: raw.slice(0, 30),
        last30: raw.slice(-30),
        containsRealNewline: raw.includes('\n'),
        containsLiteralBackslashN: raw.includes('\\n'),
        normalizedLength: normalized.length,
        normalizedLineCount: normalized.split('\n').length
    };
};

// Mints a short-lived JWT for a specific user to join an 8x8 JaaS room. Without
// this, the app joins rooms anonymously — which JaaS treats as a "testing mode"
// room where premium features like cloud recording are unavailable regardless
// of client-side toolbar config, since they're gated behind proof of moderator
// rights via a signed token. `room: '*'` (rather than the frontend's sanitized
// room name) avoids duplicating that sanitization logic server-side — this app
// already gates who can request a token at all via requireAuth on the route.
const generateJaasToken = ({ userId, name, email, moderator }) => {
    const payload = {
        aud: 'jitsi',
        iss: 'chat',
        sub: process.env.JAAS_APP_ID,
        room: '*',
        context: {
            user: {
                id: String(userId),
                name,
                email,
                moderator: !!moderator
            },
            features: {
                recording: !!moderator,
                livestreaming: false,
                transcription: false,
                'outbound-call': false
            }
        }
    };

    return jwt.sign(payload, getPrivateKey(), {
        algorithm: 'RS256',
        expiresIn: '3h',
        header: { kid: process.env.JAAS_API_KEY_ID }
    });
};

module.exports = { generateJaasToken, debugPrivateKeyShape };