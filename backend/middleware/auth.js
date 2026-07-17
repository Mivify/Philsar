const jwt = require('jsonwebtoken');

// Populates req.user = { id, role } if a valid Bearer token is present. Never
// rejects the request — used on routes that behave differently for an authenticated
// caller but must still work for anonymous ones (e.g. public registration).
const optionalAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
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
