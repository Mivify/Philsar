// Mirrored on the frontend (PASSWORD_RULES in App.tsx) so the live checklist
// there matches what actually gets enforced here. The frontend check is a UX
// convenience — this is the real gate, since a direct API call can skip the UI.
const isStrongPassword = (password) => {
    if (typeof password !== 'string' || password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false;
    return true;
};

const WEAK_PASSWORD_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';

module.exports = { isStrongPassword, WEAK_PASSWORD_MESSAGE };
