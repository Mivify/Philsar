const { Resend } = require('resend');

// Resend sends over HTTPS rather than raw SMTP, so it isn't blocked by Railway's
// outbound-SMTP restriction on lower plan tiers (Gmail SMTP was — 465/587 are
// blocked below the Pro plan). Falls back to logging the link when unset, so
// local dev/testing works without a Resend account configured.
const emailEnabled = !!process.env.RESEND_API_KEY;

const resend = emailEnabled ? new Resend(process.env.RESEND_API_KEY) : null;

const sendPasswordResetEmail = async (to, link) => {
    if (!emailEnabled) {
        console.log(`[email disabled] Password reset link for ${to}: ${link}`);
        return;
    }

    await resend.emails.send({
        from: 'PHILSAR Portal <onboarding@resend.dev>',
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
