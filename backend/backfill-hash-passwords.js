// One-time fix for accounts created before password hashing existed — every User.password
// that doesn't already look like a bcrypt hash (bcrypt hashes always start with "$2") gets
// hashed in place. Safe to re-run any time; already-hashed passwords are left untouched.
const { connectDB } = require('./config/db');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const run = async () => {
    await connectDB();

    const users = await User.findAll();
    let hashed = 0;

    for (const user of users) {
        if (user.password && user.password.startsWith('$2')) continue;

        const plaintext = user.password;
        user.password = await bcrypt.hash(plaintext, 10);
        await user.save();
        console.log(`Hashed password for ${user.email} (id ${user.id})`);
        hashed++;
    }

    console.log(`Backfill complete. ${hashed} password(s) hashed, ${users.length - hashed} already hashed.`);
    process.exit(0);
};

run().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
