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

    // The Resend SDK returns { data, error } instead of throwing on API-level
    // failures (bad sender domain, recipient blocked in test mode, etc.) — has
    // to be checked explicitly or a failed send silently looks like a success.
    const { data, error } = await resend.emails.send({
        from: 'PHILSAR Portal <onboarding@resend.dev>',
        to,
        subject: 'Reset your PHILSAR password',
        html: `
            <p>You requested a password reset for your PHILSAR Cattle Reproductive Portal account.</p>
            <p><a href="${link}">Click here to reset your password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `,
    });

    if (error) {
        console.error('Resend send failed:', error);
        throw new Error(error.message || 'Failed to send reset email');
    }
    console.log(`Reset email sent to ${to}, Resend id: ${data?.id}`);
};

module.exports = { sendPasswordResetEmail };
