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
                // user.role (freshly read just above, not decoded.role from the
                // token) so a role change by an Admin takes effect on this
                // user's very next request instead of only after they next log
                // in — the row was already being fetched here regardless, so
                // this costs nothing extra and closes an otherwise-stale-until-
                // relogin window on both promotions and demotions.
                req.user = { id: decoded.id, role: user.role };
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

// Requires a valid token belonging to an Admin (System Admin); responds 401/403 otherwise.
const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    });
};

// Admin or Sub Admin — the Learning Modules and Meetings/seminars management
// surface. Sub Admin never gets requireAdmin itself (Users, Settings, Home
// Page carousel stay System-Admin-only).
const requireSubAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role !== 'Admin' && req.user.role !== 'Sub Admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    });
};

// Admin, Sub Admin, or Secretary — specifically for writing/editing meeting
// minutes. Secretary otherwise has ordinary user-level access everywhere
// else in the app; this is its one added power.
const requireMinutesAccess = (req, res, next) => {
    requireAuth(req, res, () => {
        if (!['Admin', 'Sub Admin', 'Secretary'].includes(req.user.role)) {
            return res.status(403).json({ message: 'You do not have permission to edit meeting minutes.' });
        }
        next();
    });
};

module.exports = { optionalAuth, requireAuth, requireAdmin, requireSubAdmin, requireMinutesAccess };
