const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/email');

// Roles a user can grant themselves via public self-registration. Admin accounts can
// only be created by an existing Admin (see the role-handling logic in `register`).
const SELF_SERVE_ROLES = ['Farmer', 'Livestock Manager', 'Veterinarian', 'Extension Worker'];

// Deliberately permissive (catches "no @", "no domain", stray spaces) rather than
// a strict RFC 5322 pattern — the goal is rejecting obvious typos, not being the
// sole line of defense; deliverability is ultimately proven by the verification
// email actually arriving.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = (user) => jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

// A valid-format bcrypt hash that matches no real password. Compared against
// on every failed lookup so a nonexistent email takes the same code path (and
// roughly the same time) as a real one with a wrong password — otherwise the
// missing bcrypt.compare() call is both a faster response and a status-code
// tell (404 vs 401) that leaks which emails are registered.
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8OrJfmMptFOL3.gEO3jS3vG4TmqXKG';

const register = async (req, res) => {
    try {
        const { name, email, password, role, organization } = req.body;

        if (!email || !EMAIL_REGEX.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Only an already-authenticated Admin (creating a user via the Admin Panel,
        // which posts to this same endpoint) may set an arbitrary role. Anyone else —
        // including a fully anonymous signup — is restricted to the self-serve roles,
        // regardless of what the request body claims.
        const isAdminCreating = req.user?.role === 'Admin';
        const finalRole = isAdminCreating
            ? (role || 'Farmer')
            : (SELF_SERVE_ROLES.includes(role) ? role : 'Farmer');

        const hashedPassword = await bcrypt.hash(password, 10);

        // Admin-created accounts skip verification entirely (the admin is already
        // vouching for the address) and rely on the model's emailVerified default
        // of true. Self-serve signups are explicitly marked unverified and get a
        // token emailed to them; they can't log in until they use it (see `login`).
        let verificationToken = null;
        const userData = { name, email, password: hashedPassword, role: finalRole, organization: organization || '' };
        if (!isAdminCreating) {
            verificationToken = crypto.randomBytes(32).toString('hex');
            userData.emailVerified = false;
            userData.emailVerificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
            userData.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
        }

        const user = await User.create(userData);

        if (!isAdminCreating) {
            const baseUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
            const link = `${baseUrl}/verify-email?token=${verificationToken}`;
            try {
                await sendVerificationEmail(user.email, link);
            } catch (emailError) {
                // Registration still succeeds — the user can retry sending it
                // via the "resend verification email" flow.
                console.error('Failed to send verification email:', emailError);
            }

            return res.status(201).json({
                message: 'Account created. Please check your email to verify your account before signing in.',
                requiresVerification: true
            });
        }

        res.status(201).json({
            message: 'User registered successfully',
            token: generateToken(user),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                status: user.status,
                profilePicture: user.profilePicture,
                modulesCompleted: user.modulesCompleted,
                seminarsAttended: user.seminarsAttended,
                dssAssessmentsRun: user.dssAssessmentsRun
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        const passwordMatches = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);
        if (!user || !passwordMatches) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status === 'Inactive') {
            return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please verify your email before logging in.',
                requiresVerification: true
            });
        }

        // Return full user details for profile state
        res.status(200).json({
            message: 'Login successful',
            token: generateToken(user),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                status: user.status,
                profilePicture: user.profilePicture,
                modulesCompleted: user.modulesCompleted,
                seminarsAttended: user.seminarsAttended,
                dssAssessmentsRun: user.dssAssessmentsRun
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, organization, status, profilePicture, password, currentPassword } = req.body;

        const isSelf = req.user.id === parseInt(id, 10);
        const isAdmin = req.user.role === 'Admin';
        if (!isSelf && !isAdmin) {
            return res.status(403).json({ message: 'You can only edit your own profile' });
        }

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Password change handling
        let passwordChanged = false;
        if (password) {
            const currentMatches = await bcrypt.compare(currentPassword || '', user.password);
            if (!currentMatches) {
                return res.status(401).json({ message: 'Incorrect current password' });
            }
            user.password = await bcrypt.hash(password, 10);
            user.passwordChangedAt = Date.now();
            passwordChanged = true;
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (organization !== undefined) user.organization = organization;
        if (profilePicture !== undefined) user.profilePicture = profilePicture;
        // modulesCompleted is intentionally not settable here — it's always
        // recomputed from actual lesson completions in progressController.js.
        // Accepting it from the request body would let a user directly
        // overwrite their own progress stat without doing the work.
        // role/status are account-management fields — only an Admin may change them,
        // even when editing their own account, to close the self-escalation path.
        if (isAdmin) {
            if (role) user.role = role;
            if (status) user.status = status;
        }

        await user.save();

        res.status(200).json({
            message: 'Profile updated successfully',
            // Changing the password invalidates every previously issued token
            // (see optionalAuth's passwordChangedAt check) — including whichever
            // one this very request used — so the caller needs a new one to stay
            // logged in without an unexpected 401 on their next request.
            ...(passwordChanged ? { token: generateToken(user) } : {}),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                status: user.status,
                profilePicture: user.profilePicture,
                modulesCompleted: user.modulesCompleted,
                seminarsAttended: user.seminarsAttended,
                dssAssessmentsRun: user.dssAssessmentsRun
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};

// Lets the client refresh a logged-in user's data on load instead of trusting a
// possibly-stale localStorage snapshot indefinitely (e.g. modulesCompleted/dssAssessmentsRun
// changing via some other path since the last login).
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const isSelf = req.user.id === parseInt(id, 10);
        const isAdmin = req.user.role === 'Admin';
        if (!isSelf && !isAdmin) {
            return res.status(403).json({ message: 'You can only view your own profile' });
        }

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            status: user.status,
            profilePicture: user.profilePicture,
            modulesCompleted: user.modulesCompleted,
            seminarsAttended: user.seminarsAttended,
            dssAssessmentsRun: user.dssAssessmentsRun
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password'] },
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (req.user.id === user.id) {
            return res.status(400).json({ message: "You can't delete your own account." });
        }

        // Only an Admin can grant the Admin role to anyone else, so losing the
        // last one would lock the whole app out of admin features with no way
        // back in short of editing the database directly.
        if (user.role === 'Admin') {
            const adminCount = await User.count({ where: { role: 'Admin' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last remaining Admin account.' });
            }
        }

        await user.destroy();
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        // Only do the real work if the email matched an account, but always
        // respond identically either way — otherwise the response itself
        // would leak which emails are registered.
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
            await user.save();

            // Falls back to the actual request host if BACKEND_URL isn't configured,
            // so a missing env var can't produce a broken "undefined/..." link.
            const baseUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
            const link = `${baseUrl}/reset-password?token=${rawToken}`;
            // Caught separately from the outer try/catch — a delivery failure must
            // still fall through to the identical generic response below, or the
            // response itself would leak whether the email is registered.
            try {
                await sendPasswordResetEmail(user.email, link);
            } catch (emailError) {
                console.error('Failed to send password reset email:', emailError);
            }
        }

        res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Missing token or new password' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({ where: { resetPasswordTokenHash: tokenHash } });

        if (!user || !user.resetPasswordExpires || Number(user.resetPasswordExpires) < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired reset link' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordTokenHash = null;
        user.resetPasswordExpires = null;
        user.passwordChangedAt = Date.now();
        await user.save();

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Missing verification token' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({ where: { emailVerificationTokenHash: tokenHash } });

        if (!user || !user.emailVerificationExpires || Number(user.emailVerificationExpires) < Date.now()) {
            return res.status(400).json({ message: 'This verification link is invalid or has expired.' });
        }

        user.emailVerified = true;
        user.emailVerificationTokenHash = null;
        user.emailVerificationExpires = null;
        await user.save();

        res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        // Same anti-enumeration shape as forgotPassword: only do real work when
        // there's an actual unverified account behind the email, but always
        // respond identically either way.
        if (user && !user.emailVerified) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            user.emailVerificationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
            await user.save();

            const baseUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
            const link = `${baseUrl}/verify-email?token=${rawToken}`;
            try {
                await sendVerificationEmail(user.email, link);
            } catch (emailError) {
                console.error('Failed to send verification email:', emailError);
            }
        }

        res.status(200).json({ message: 'If that account needs verifying, a new email has been sent.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    register,
    login,
    updateProfile,
    getUserById,
    getUsers,
    deleteUser,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification
};
