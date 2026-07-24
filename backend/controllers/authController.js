const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../utils/email');

// Roles a user can grant themselves via public self-registration. Admin accounts can
// only be created by an existing Admin (see the role-handling logic in `register`).
const SELF_SERVE_ROLES = ['Farmer', 'Livestock Manager', 'Veterinarian', 'Extension Worker'];

const generateToken = (user) => jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

const register = async (req, res) => {
    try {
        const { name, email, password, role, organization } = req.body;

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

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: finalRole,
            organization: organization || ''
        });

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
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status === 'Inactive') {
            return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' });
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
        const { name, email, role, organization, status, profilePicture, password, currentPassword, modulesCompleted } = req.body;

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
        if (modulesCompleted !== undefined) user.modulesCompleted = parseInt(modulesCompleted);
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

module.exports = { register, login, updateProfile, getUserById, getUsers, deleteUser, forgotPassword, resetPassword };
