const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Notification = require('../models/Notification');
const { sendPasswordResetEmail, sendVerificationEmail, sendEmailChangeConfirmation, sendRoleChangedEmail } = require('../utils/email');
const { logActivity } = require('../utils/activityLog');
const { isStrongPassword, WEAK_PASSWORD_MESSAGE } = require('../utils/passwordPolicy');
const { findEmailDomainProblem, checkMailbox, isMailboxCheckEnabled } = require('../utils/emailValidation');

// Roles a user can grant themselves via public self-registration. Admin accounts can
// only be created by an existing Admin (the role-handling logic in `register`).
const SELF_SERVE_ROLES = ['Farmer', 'Livestock Manager', 'Veterinarian', 'Extension Worker'];

// Deliberately permissive (catches "no @", No Dot, stray spaces) rather than
// it is rejecting obvious typos, not being the
// but emails are proven by the verification
// email actually arriving.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = (user) => jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

// A valid-format bcrypt hash that matches no real password
// To prevent attackers from discovering registered email addresses
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8OrJfmMptFOL3.gEO3jS3vG4TmqXKG';

const register = async (req, res) => {
    try {
        const { name, email, password, role, organization } = req.body;

        if (!email || !EMAIL_REGEX.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        // Fake domains, typos and throwaway inboxes are rejected before any account exists
        const emailProblem = await findEmailDomainProblem(email);
        if (emailProblem) {
            return res.status(400).json({ message: emailProblem.message });
        }
        // ...and so are mailboxes the provider says don't exist (Abstract API)
        const mailbox = await checkMailbox(email);
        if (mailbox.status === 'rejected') {
            return res.status(400).json({ message: mailbox.message });
        }

        // An unverified account is only a reservation — nobody has proved they own
        // that email, and it can't log in or hold any data.
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser && existingUser.emailVerified) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Only an already-authenticated Admin (creating a user via the Admin Panel,
        // can add another admin account) 
        const isAdminCreating = req.user?.role === 'Admin';
        const finalRole = isAdminCreating
            ? (role || 'Farmer')
            : (SELF_SERVE_ROLES.includes(role) ? role : 'Farmer');

        // Only enforced for self-serve signups — an Admin setting up a staff
        // account via the Admin Panel isn't gated by this
        if (!isAdminCreating && !isStrongPassword(password)) {
            return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Admin-created accounts skip verification entirely
        let verificationToken = null;
        const userData = { name, email, password: hashedPassword, role: finalRole, organization: organization || '' };
        if (!isAdminCreating) {
            verificationToken = crypto.randomBytes(32).toString('hex');
            userData.emailVerified = false;
            userData.emailVerificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
            userData.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
        }

        // Deleted only now, after every validation above has passed, so a signup
        // rejected for (say) a weak password never discards anything.
        if (existingUser) {
            await existingUser.destroy();
        }

        const user = await User.create(userData);

        const replacedNote = existingUser ? ' (replaced an earlier unverified registration)' : '';
        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'account_registered', category: 'account',
            details: (isAdminCreating ? `${finalRole} account created for ${email} by an admin` : `${finalRole} account self-registered: ${email}`) + replacedNote,
            req
        });

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
                dssAssessmentsRun: user.dssAssessmentsRun,
                pendingEmail: user.pendingEmail
            }
        });
    } catch (error) {
        // Simultaneous signups for one address can all pass but if its verified
        // it will say that the user already exist
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ message: 'User already exists' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Live check behind the registration form's email field. Only says whether the
// address could be real, never whether it's already registered, so it can't
// be used to look up accounts.
const checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
            return res.status(200).json({ valid: false, message: 'Please enter a valid email address' });
        }
        // problem.suggestion (e.g. juan@gmail.com for juan@gmaiol.com) lets the form offer a one-click fix
        const problem = await findEmailDomainProblem(email);
        if (problem) {
            return res.status(200).json({ valid: false, ...problem });
        }
        // The mailbox check spends Abstract API requests (100 a month on the free
        // plan), so the form asks for it only once the user leaves the email field.
        // mailboxCheckAvailable tells the form whether that check is coming.
        if (req.body.mailbox !== true) {
            return res.status(200).json({ valid: true, mailboxConfirmed: false, mailboxCheckAvailable: isMailboxCheckEnabled() });
        }
        const mailbox = await checkMailbox(email, { budgetKey: req.ip });
        if (mailbox.status === 'rejected') {
            return res.status(200).json({ valid: false, message: mailbox.message, suggestion: mailbox.suggestion });
        }
        res.status(200).json({ valid: true, mailboxConfirmed: mailbox.status === 'exists' });
    } catch (error) {
        res.status(500).json({ message: 'Error checking email address' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        const passwordMatches = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);
        if (!user || !passwordMatches) {
            logActivity({
                userId: user?.id || null, userName: email, userRole: user?.role || null,
                action: 'login_failed', category: 'auth',
                details: user ? 'Wrong password' : 'No account with this email', req
            });
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status === 'Inactive') {
            logActivity({
                userId: user.id, userName: user.name, userRole: user.role,
                action: 'login_blocked', category: 'auth', details: 'Deactivated account attempted login', req
            });
            return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' });
        }

        if (!user.emailVerified) {
            logActivity({
                userId: user.id, userName: user.name, userRole: user.role,
                action: 'login_blocked', category: 'auth', details: 'Unverified email attempted login', req
            });
            return res.status(403).json({
                message: 'Please verify your email before logging in.',
                requiresVerification: true
            });
        }

        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'login_success', category: 'auth', details: null, req
        });

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
                dssAssessmentsRun: user.dssAssessmentsRun,
                pendingEmail: user.pendingEmail
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


// this is purely so the security log can distinguish a normal sign-out from the
// 15-minute inactivity auto-logout (see the `reason` field).
const logout = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const reason = req.body?.reason === 'inactivity' ? 'Auto-logged out after 15 minutes of inactivity' : 'Manual sign-out';
        logActivity({
            userId: req.user.id, userName: user?.name, userRole: user?.role,
            action: 'logout', category: 'auth', details: reason, req
        });
        res.status(200).json({ message: 'Logged out' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, organization, status, profilePicture, password, currentPassword } = req.body;

        const isSelf = req.user.id === parseInt(id, 10);
        const isAdmin = req.user.role === 'Admin';
        if (!isSelf && !isAdmin) {
            return res.status(403).json({ message: 'You can only edit your own profile' });
        }

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const oldRole = user.role;
        const oldStatus = user.status;
        const oldName = user.name;
        const targetEmail = user.email;

        // Password change handling
        let passwordChanged = false;
        if (password) {
            if (!isStrongPassword(password)) {
                return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
            }
            const currentMatches = await bcrypt.compare(currentPassword || '', user.password);
            if (!currentMatches) {
                return res.status(401).json({ message: 'Incorrect current password' });
            }
            user.password = await bcrypt.hash(password, 10);
            user.passwordChangedAt = Date.now();
            passwordChanged = true;
        }

        if (name) user.name = name;
        if (organization !== undefined) user.organization = organization;
        if (profilePicture !== undefined) user.profilePicture = profilePicture;
        if (isAdmin) {
            const effectiveRole = role || oldRole;
            const losingAdminRole = oldRole === 'Admin' && effectiveRole !== 'Admin';
            const deactivatingAdmin = effectiveRole === 'Admin' && status === 'Inactive' && oldStatus !== 'Inactive';
            if (losingAdminRole || deactivatingAdmin) {
                const adminCount = await User.count({ where: { role: 'Admin' } });
                if (adminCount <= 1) {
                    return res.status(400).json({ message: 'Cannot make this change — it would leave the system with no remaining Admin account.' });
                }
            }
            if (role) user.role = role;
            if (status) user.status = status;
        }

        await user.save();

        if (passwordChanged) {
            logActivity({
                userId: user.id, userName: user.name, userRole: user.role,
                action: 'password_changed', category: 'account', details: 'User changed their own password', req
            });
        }
        if (name && name !== oldName) {
            logActivity({
                userId: user.id, userName: user.name, userRole: user.role,
                action: 'name_changed', category: 'account',
                details: `${targetEmail}: "${oldName}" → "${name}"`, req
            });
        }
        if (isAdmin && !isSelf) {
            const actor = await User.findByPk(req.user.id, { attributes: ['name'] });
            const actorName = actor?.name || `admin #${req.user.id}`;
            if (role && role !== oldRole) {
                logActivity({
                    userId: user.id, userName: user.name, userRole: user.role,
                    action: 'role_changed', category: 'account',
                    details: `${targetEmail}: ${oldRole} → ${role} (changed by ${actorName})`, req
                });
                // Tell the user: a notice under the bell in the portal, plus an email.
                // Neither holds up the admin's response or undoes the change if it fails.
                Notification.create({ userId: user.id, type: 'role_changed', data: { from: oldRole, to: role } })
                    .catch(err => console.error('Failed to create role change notification:', err));
                sendRoleChangedEmail(user.email, user.name, oldRole, role)
                    .catch(err => console.error('Failed to send role change email:', err));
            }
            if (status && status !== oldStatus) {
                logActivity({
                    userId: user.id, userName: user.name, userRole: user.role,
                    action: 'account_status_changed', category: 'account',
                    details: `${targetEmail}: ${oldStatus} → ${status} (changed by ${actorName})`, req
                });
            }
        }

        res.status(200).json({
            message: 'Profile updated successfully',
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
                dssAssessmentsRun: user.dssAssessmentsRun,
                pendingEmail: user.pendingEmail
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};


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
            dssAssessmentsRun: user.dssAssessmentsRun,
            pendingEmail: user.pendingEmail
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password', 'emailVerificationTokenHash', 'emailVerificationExpires', 'resetPasswordTokenHash', 'resetPasswordExpires'] },
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// Doesn't actually delete — flags the account for deletion, pending a Sub
// Admin's approval
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

        if (user.pendingDeletion) {
            return res.status(400).json({ message: 'A deletion request for this account is already pending Sub Admin approval.' });
        }

        // avoide letting the admin delete the last remaining admin account
        if (user.role === 'Admin') {
            const adminCount = await User.count({ where: { role: 'Admin' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last remaining Admin account.' });
            }
        }

        const actor = await User.findByPk(req.user.id, { attributes: ['name'] });
        user.pendingDeletion = true;
        user.pendingDeletionRequestedByName = actor?.name || `Admin #${req.user.id}`;
        await user.save();

        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'account_deletion_requested', category: 'account',
            details: `Deletion of ${user.email} (${user.role}) requested by ${actor?.name || `admin #${req.user.id}`} — awaiting Sub Admin approval`, req
        });

        res.status(200).json({ message: 'Deletion request submitted — awaiting Sub Admin approval.', pendingDeletion: true, pendingDeletionRequestedByName: user.pendingDeletionRequestedByName });
    } catch (error) {
        res.status(500).json({ message: 'Error requesting user deletion', error: error.message });
    }
};

const approveUserDeletion = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.pendingDeletion) {
            return res.status(400).json({ message: 'This account has no pending deletion request.' });
        }


        if (user.role === 'Admin') {
            const adminCount = await User.count({ where: { role: 'Admin' } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last remaining Admin account.' });
            }
        }

        const approver = await User.findByPk(req.user.id, { attributes: ['name'] });
        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'account_deletion_approved', category: 'account',
            details: `${user.email} (${user.role}) deletion approved by ${approver?.name || `Sub Admin #${req.user.id}`} — originally requested by ${user.pendingDeletionRequestedByName || 'unknown'}`, req
        });

        await user.destroy();
        await Notification.destroy({ where: { userId: user.id } });
        res.status(200).json({ message: 'Deletion approved — account removed.' });
    } catch (error) {
        res.status(500).json({ message: 'Error approving user deletion', error: error.message });
    }
};

const rejectUserDeletion = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.pendingDeletion) {
            return res.status(400).json({ message: 'This account has no pending deletion request.' });
        }

        const rejector = await User.findByPk(req.user.id, { attributes: ['name'] });
        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'account_deletion_rejected', category: 'account',
            details: `Deletion of ${user.email} (${user.role}) rejected by ${rejector?.name || `Sub Admin #${req.user.id}`} — originally requested by ${user.pendingDeletionRequestedByName || 'unknown'}`, req
        });

        user.pendingDeletion = false;
        user.pendingDeletionRequestedByName = null;
        await user.save();

        res.status(200).json({ message: 'Deletion request rejected.' });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting user deletion', error: error.message });
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

            const baseUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
            const link = `${baseUrl}/reset-password?token=${rawToken}`;
            try {
                await sendPasswordResetEmail(user.email, link);
            } catch (emailError) {
                console.error('Failed to send password reset email:', emailError);
            }

            logActivity({
                userId: user.id, userName: user.name, userRole: user.role,
                action: 'password_reset_requested', category: 'account', details: null, req
            });
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
        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
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

        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'password_reset_completed', category: 'account', details: null, req
        });

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


const changeEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { newEmail, currentPassword } = req.body;

        if (req.user.id !== parseInt(id, 10)) {
            return res.status(403).json({ message: 'You can only change your own email.' });
        }
        if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        const emailProblem = await findEmailDomainProblem(newEmail);
        if (emailProblem) {
            return res.status(400).json({ message: emailProblem.message });
        }

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const currentMatches = await bcrypt.compare(currentPassword || '', user.password);
        if (!currentMatches) {
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        if (newEmail.toLowerCase() === user.email.toLowerCase()) {
            return res.status(400).json({ message: 'That is already your current email address.' });
        }
        // Same rule as register: an unverified account on this address is only a
        // reservation, so it doesn't block the change. It's discarded in
        // verifyEmailChange once this user proves they control the inbox.
        const inUse = await User.findOne({ where: { email: newEmail } });
        if (inUse && inUse.emailVerified) {
            return res.status(400).json({ message: 'That email address is already in use.' });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        user.pendingEmail = newEmail;
        user.emailChangeTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.emailChangeExpires = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();

        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'email_change_requested', category: 'account',
            details: `${user.email} → ${newEmail} (awaiting confirmation)`, req
        });

        const baseUrl = process.env.BACKEND_URL || `https://${req.get('host')}`;
        const link = `${baseUrl}/verify-email-change?token=${rawToken}`;
        try {
            await sendEmailChangeConfirmation(newEmail, link);
        } catch (emailError) {
            console.error('Failed to send email change confirmation:', emailError);
        }

        res.status(200).json({
            message: `A confirmation link was sent to ${newEmail}. Your email won't change until you click it.`,
            pendingEmail: newEmail
        });
    } catch (error) {
        res.status(500).json({ message: 'Error requesting email change', error: error.message });
    }
};

// Step 2: the link from the email above lands here. No auth required — it's
// a bearer token proving control of the new inbox,
const verifyEmailChange = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Missing confirmation token' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({ where: { emailChangeTokenHash: tokenHash } });

        if (!user || !user.emailChangeExpires || Number(user.emailChangeExpires) < Date.now()) {
            return res.status(400).json({ message: 'This confirmation link is invalid or has expired.' });
        }

        // Re-checked here, not just at request time — someone else could have
        // registered or been assigned this exact address in the meantime.
        const stillFree = await User.findOne({ where: { email: user.pendingEmail } });
        if (stillFree && stillFree.id !== user.id) {
            if (stillFree.emailVerified) {
                user.pendingEmail = null;
                user.emailChangeTokenHash = null;
                user.emailChangeExpires = null;
                await user.save();
                return res.status(400).json({ message: 'That email address is now in use by another account. Please request the change again with a different address.' });
            }
            // Clicking this link just proved this user controls the inbox, so an
            // unverified reservation on the address is discarded.
            await stillFree.destroy();
        }

        const oldEmail = user.email;
        const newEmail = user.pendingEmail;
        user.email = newEmail;
        user.pendingEmail = null;
        user.emailChangeTokenHash = null;
        user.emailChangeExpires = null;
        await user.save();

        logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'email_changed', category: 'account',
            details: `${oldEmail} → ${newEmail}`, req
        });

        res.status(200).json({ message: 'Your email address has been updated. Please sign in with your new email.' });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ message: 'That email address is now in use by another account. Please request the change again with a different address.' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    register,
    checkEmail,
    login,
    logout,
    updateProfile,
    getUserById,
    getUsers,
    deleteUser,
    approveUserDeletion,
    rejectUserDeletion,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
    changeEmail,
    verifyEmailChange
};
