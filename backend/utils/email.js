const nodemailer = require('nodemailer');

// Gmail SMTP needs a Google Account "App Password", not the regular account
// password. Falls back to logging the link when unset, so local dev/testing
// works without real Gmail credentials configured — same spirit as the
// Cloudinary-vs-local-disk fallback in moduleController.js.
const emailEnabled = !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);

const transporter = emailEnabled
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
    })
    : null;

const sendPasswordResetEmail = async (to, link) => {
    if (!emailEnabled) {
        console.log(`[email disabled] Password reset link for ${to}: ${link}`);
        return;
    }

    await transporter.sendMail({
        from: `"PHILSAR Portal" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'Reset your PHILSAR password',
        html: `
            <p>You requested a password reset for your PHILSAR Cattle Reproductive Portal account.</p>
            <p><a href="${link}">Click here to reset your password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `,
    });
};

module.exports = { sendPasswordResetEmail };
