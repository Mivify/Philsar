const jwt = require('jsonwebtoken');
require('dotenv').config();

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

    return jwt.sign(payload, process.env.JAAS_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '3h',
        header: { kid: process.env.JAAS_API_KEY_ID }
    });
};

module.exports = { generateJaasToken };