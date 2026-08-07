// Brevo sends over HTTPS rather than raw SMTP, so it isn't blocked by Railway's
// outbound-SMTP restriction on lower plan tiers (Gmail SMTP was — 465/587 are
// blocked below the Pro plan). Falls back to logging the link when unset, so
// local dev/testing works without a Brevo account configured.
const emailEnabled = !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

const sendPasswordResetEmail = async (to, link) => {
    if (!emailEnabled) {
        console.log(`[email disabled] Password reset link for ${to}: ${link}`);
        return;
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            sender: { name: 'PHILSAR Portal', email: process.env.BREVO_SENDER_EMAIL },
            to: [{ email: to }],
            subject: 'Reset your PHILSAR password',
            htmlContent: `
                <p>You requested a password reset for your PHILSAR Cattle Reproductive Portal account.</p>
                <p><a href="${link}">Click here to reset your password</a></p>
                <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            `,
        }),
    });

    // Brevo returns a JSON error body (not a thrown exception) on API-level
    // failures (bad sender, invalid key, etc.) — has to be checked explicitly
    // or a failed send silently looks like a success.
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        console.error('Brevo send failed:', error);
        throw new Error(error.message || 'Failed to send reset email');
    }

    const data = await response.json();
    console.log(`Reset email sent to ${to}, Brevo messageId: ${data?.messageId}`);
};

module.exports = { sendPasswordResetEmail };
