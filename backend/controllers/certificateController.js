const Certificate = require('../models/Certificate');

// Public: what the QR code on a certificate opens. Shows only what is already
// printed on the certificate (name, seminar, dates), never contact details.
const verifyCertificate = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim().toUpperCase();
        const certificate = await Certificate.findOne({ where: { code } });
        if (!certificate) {
            return res.status(404).json({ status: 'not_found', code });
        }
        res.status(200).json({
            status: certificate.revokedAt ? 'revoked' : 'valid',
            code: certificate.code,
            recipientName: certificate.recipientName,
            meetingTitle: certificate.meetingTitle,
            meetingHost: certificate.meetingHost,
            meetingDate: certificate.meetingDate,
            issuedAt: certificate.createdAt,
            revokedAt: certificate.revokedAt
        });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying certificate' });
    }
};

module.exports = { verifyCertificate };
