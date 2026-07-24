const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Populates req.user = { id, role } if a valid Bearer token is present. Never
// rejects the request — used on routes that behave differently for an authenticated
// caller but must still work for anonymous ones (e.g. public registration).
//
// Also checks the token against the user's passwordChangedAt: a token issued
// before the user's last password change is treated as invalid, so resetting
// a (possibly compromised) password actually invalidates sessions instead of
// leaving up-to-7-day-old tokens usable regardless.
const optionalAuth = async (req, res, next) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
            const user = await User.findByPk(decoded.id, { attributes: ['id', 'role', 'passwordChangedAt', 'status'] });
            // JWT `iat` only has 1-second resolution, but passwordChangedAt is
            // millisecond-precise — comparing them directly would spuriously
            // invalidate a token generated in the very same second as the
            // password change (e.g. updateProfile returns a fresh token in the
            // same response that sets passwordChangedAt). Floor both to seconds.
            const tokenIssuedBeforePasswordChange = user?.passwordChangedAt && decoded.iat < Math.floor(Number(user.passwordChangedAt) / 1000);
            // Same immediate-invalidation treatment as a password change — an admin
            // deactivating a user shouldn't leave their existing token usable until
            // it naturally expires.
            if (user && !tokenIssuedBeforePasswordChange && user.status !== 'Inactive') {
                req.user = { id: decoded.id, role: decoded.role };
            }
        } catch (error) {
            // Invalid/expired token — treat the same as no token rather than erroring.
        }
    }
    next();
};

// Requires a valid token; responds 401 otherwise.
const requireAuth = (req, res, next) => {
    optionalAuth(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        next();
    });
};

// Requires a valid token belonging to an Admin; responds 401/403 otherwise.
const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    });
};

module.exports = { optionalAuth, requireAuth, requireAdmin };
