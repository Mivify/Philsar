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

// Mints a short-lived JWT for a specific user to join an 8x8 JaaS room. Without
// this, the app joins rooms anonymously — which JaaS treats as a "testing mode"
// room where premium features like cloud recording are unavailable regardless
// of client-side toolbar config, since they're gated behind proof of moderator
// rights via a signed token. `room` is matched to the exact room being joined
// (not the "*" wildcard) — this specific tenant rejected wildcard-room tokens
// with "not allowed to join" even though the signature and every other claim
// were valid, so an exact literal match is the more reliably-honored path.
const generateJaasToken = ({ userId, name, email, moderator, room }) => {
    const payload = {
        aud: 'jitsi',
        iss: 'chat',
        sub: process.env.JAAS_APP_ID,
        room: room || '*',
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
        // 8x8 requires nbf on its own, alongside exp — jsonwebtoken's expiresIn
        // option only sets iat/exp, not nbf, and JaaS silently rejects the join
        // (despite a perfectly valid signature) without it.
        notBefore: 0,
        header: { kid: process.env.JAAS_API_KEY_ID }
    });
};

module.exports = { generateJaasToken };