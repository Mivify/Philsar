const { Op } = require('sequelize');
const ActivityLog = require('../models/ActivityLog');

const getActivityLogs = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const { category, search } = req.query;

        const where = {};
        if (category && category !== 'all') {
            where.category = category;
        }
        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            where[Op.or] = [
                { userName: { [Op.like]: term } },
                { details: { [Op.like]: term } },
                { action: { [Op.like]: term } },
            ];
        }

        const { rows, count } = await ActivityLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });

        res.status(200).json({
            logs: rows,
            total: count,
            page,
            totalPages: Math.max(Math.ceil(count / limit), 1),
        });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving activity logs', error: error.message });
    }
};

// Powers the "at a glance" anomaly banner above the log table — deliberately
// independent of whatever category/search filter is currently applied, since
// it answers "should I be worried right now?" rather than "show me rows".
const getActivitySummary = async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const inWindow = { createdAt: { [Op.gte]: since } };

        const [failedLoginRows, lockouts, roleOrStatusChanges, deletions] = await Promise.all([
            ActivityLog.findAll({ where: { ...inWindow, action: 'login_failed' }, attributes: ['userName'] }),
            ActivityLog.count({ where: { ...inWindow, action: 'account_locked' } }),
            ActivityLog.count({ where: { ...inWindow, action: { [Op.in]: ['role_changed', 'account_status_changed'] } } }),
            // 'account_deleted' is never actually written — deletions now go
            // through the two-person approval flow, which logs
            // 'account_deletion_approved' at the point the account is actually
            // removed (see authController.js's approveUserDeletion).
            ActivityLog.count({ where: { ...inWindow, action: 'account_deletion_approved' } }),
        ]);

        // Distinct targeted accounts matter more than raw attempt count here —
        // one account with 20 failed attempts and 20 accounts with 1 each read
        // very differently as security signals.
        const failedLoginAccounts = new Set(failedLoginRows.map(r => r.userName)).size;

        res.status(200).json({
            since: since.toISOString(),
            failedLogins: { accounts: failedLoginAccounts, attempts: failedLoginRows.length },
            lockouts,
            roleOrStatusChanges,
            deletions,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error computing activity summary', error: error.message });
    }
};

module.exports = { getActivityLogs, getActivitySummary };
