const User = require('../models/User');

const register = async (req, res) => {
    try {
        const { name, email, password, role, organization } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'Farmer',
            organization: organization || ''
        });

        res.status(201).json({
            message: 'User registered successfully',
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

        if (user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Return full user details for profile state
        res.status(200).json({
            message: 'Login successful',
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

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Password change handling
        if (password) {
            if (user.password !== currentPassword) {
                return res.status(401).json({ message: 'Incorrect current password' });
            }
            user.password = password;
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (organization !== undefined) user.organization = organization;
        if (status) user.status = status;
        if (profilePicture !== undefined) user.profilePicture = profilePicture;
        if (modulesCompleted !== undefined) user.modulesCompleted = parseInt(modulesCompleted);

        await user.save();

        res.status(200).json({
            message: 'Profile updated successfully',
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

const getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
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

module.exports = { register, login, updateProfile, getUsers, deleteUser };
