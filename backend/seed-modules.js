const { connectDB, sequelize } = require('./config/db');
const Module = require('./models/Module');
const Meeting = require('./models/Meeting');
const Setting = require('./models/Setting');
const User = require('./models/User');

const seedData = async () => {
    await connectDB();

    console.log('Dropping and recreating database schema...');
    await sequelize.sync({ force: true });

    // 1. Seed Global Settings
    const defaultSettings = [
        { key: 'portalName', value: 'PHILSAR — Cattle Reproductive Management Portal' },
        { key: 'aiProvider', value: 'Gemini API (Google)' },
        { key: 'videoProvider', value: 'Jitsi Meet (Open Source)' },
        { key: 'dssVersion', value: 'v2.1 — AI-Assisted Rule-Based' }
    ];

    try {
        for (const setting of defaultSettings) {
            await Setting.findOrCreate({
                where: { key: setting.key },
                defaults: { value: setting.value }
            });
        }
        console.log('Global settings checked/seeded successfully.');
    } catch (err) {
        console.error('Error seeding settings:', err);
    }

    // 2. Seed Learning Modules
    const modulesToSeed = [
        {
            title: 'Cattle Reproductive Anatomy',
            description: 'Explore the male and female reproductive organs of cattle and their functions.',
            content: `# Cattle Reproductive Anatomy\n\nDetailed overview of the reproductive organs in cattle is fundamental to understanding breeding methodologies and diagnosing reproductive disorders.\n\n## 1. Female Reproductive Organs\n- **Ovaries:** The primary reproductive organs. They produce eggs (ova) and hormones (estrogen and progesterone).\n- **Oviducts (Fallopian Tubes):** Small, convoluted tubes that transport the egg from the ovary to the uterus. Fertilization typically occurs here.\n- **Uterus:** Consists of two uterine horns and a uterine body. It is the site of fetal development during pregnancy.\n- **Cervix:** A thick-walled, fibrous organ that serves as a gateway between the uterus and the vagina. It protects the uterus from external contaminants.\n- **Vagina:** The birth canal and the site of semen deposition during natural service.\n- **Vulva:** The external opening of the reproductive tract.\n\n## 2. Male Reproductive Organs\n- **Testes:** Produce sperm and testosterone.\n- **Epididymis:** Stores and matures sperm.\n- **Vas Deferens:** Transports sperm to the urethra.\n- **Accessory Glands:** Add fluids to sperm to form semen.\n- **Penis:** The copulatory organ.`,
            imageUrl: 'https://images.unsplash.com/photo-1596733430284-f74371912ed4?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Estrus Cycle & Detection',
            description: 'Understand the stages of the estrus cycle and how to identify signs of heat in cattle.',
            content: `# Estrus Cycle & Detection in Cattle\n\nThe estrus cycle is the period between two consecutive heats (estrus). In cows, the average cycle length is **21 days** (range 18-24 days).\n\n## Stages of the Estrus Cycle\n1. **Proestrus (3 days):** Preparatory phase. Follicles grow rapidly and estrogen rises. Restlessness begins.\n2. **Estrus (12-18 hours):** The true standing heat phase. The cow stands to be mounted.\n3. **Metestrus (3-4 days):** Ovulation occurs 10-15 hours after the end of estrus. Corpus Luteum (CL) starts forming.\n4. **Diestrus (14-15 days):** The longest phase. Progesterone is high, preparing for pregnancy.\n\n## Signs of Standing Heat\n- **Standing to be mounted (most reliable indicator).**\n- Clear, viscous mucus discharge from vulva.\n- Nervousness, restlessness, and bellowing.\n- Swollen and reddened vulva.`,
            imageUrl: 'https://images.unsplash.com/photo-1570158268183-d296b2892211?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Artificial Insemination (AI)',
            description: 'Step-by-step procedures for AI, semen handling, and timing for optimal conception.',
            content: `# Artificial Insemination (AI)\n\nArtificial Insemination involves depositing semen into the female reproductive tract by manual means.\n\n## Core Steps\n1. **Heat Detection:** Timing is crucial. Inseminate 12 hours after standing heat starts (AM/PM rule).\n2. **Semen Thawing:** Thaw frozen semen straws in a water bath at 35–37°C for 30–45 seconds.\n3. **Sanitation:** Wipe the cow's vulva clean.\n4. **Insertion:** Pass the AI gun through the cervix and deposit semen into the uterine body.\n5. **Record-Keeping:** Document details to track parentage and expected calving dates.`,
            imageUrl: 'https://images.unsplash.com/photo-1543851508-dd1d85b1a646?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Natural Mating Methods',
            description: 'Guidelines for hand mating and pasture mating, bull selection, and mating ratios.',
            content: `# Natural Mating Methods\n\nNatural mating remains popular in many commercial cattle farms. Proper management is necessary to optimize breeding efficiency.\n\n## Mating Systems\n- **Pasture Mating:** The bull runs with the herd throughout the breeding season. Ratios of 1 bull to 20-30 cows are recommended.\n- **Hand Mating:** The cow in heat is brought to a separate pen to be bred by a selected bull. Allows for precise record-keeping.`,
            imageUrl: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Gestation & Pregnancy Management',
            description: 'Monitor pregnancy stages, nutritional needs, and prepare for successful calving.',
            content: `# Gestation & Pregnancy Management\n\nThe average gestation period in cattle is **283 days** (approx. 9 months).\n\n## Pregnancy Diagnosis\n- **Rectal Palpation:** Safe after 35-40 days.\n- **Ultrasound:** Can detect pregnancy at 26-28 days.\n- **Blood Tests:** Detect pregnancy-associated glycoproteins (PAGs) after 28 days.`,
            imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Reproductive Health & Disorders',
            description: 'Identify and manage common reproductive diseases, infertility, and postpartum issues.',
            content: `# Reproductive Health & Disorders\n\nReproductive diseases and disorders can cause significant economic losses through extended calving intervals and calf losses.\n\n## Common Disorders\n- **Retained Placenta:** Failure to expel fetal membranes within 12 hours of calving.\n- **Metritis:** Bacterial infection of the uterus, often following calving complications.\n- **Cystic Ovaries:** Ovarian structures that persist, causing abnormal heat cycles (nymphomania or anestrus).`,
            imageUrl: 'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?auto=format&fit=crop&q=80&w=600'
        }
    ];

    try {
        for (const mod of modulesToSeed) {
            await Module.findOrCreate({
                where: { title: mod.title },
                defaults: mod
            });
        }
        console.log('Learning modules seeded successfully.');
    } catch (err) {
        console.error('Error seeding modules:', err);
    }

    // 3. Seed Meetings
    const defaultMeetings = [
        {
            title: 'Estrus Synchronization Protocols',
            host: 'Dr. Maria Reyes · DA-BAI',
            dateTime: 'Today, 2:00 PM',
            status: 'Live',
            registrants: 47,
            videoLink: 'https://meet.jit.si/philsar-estrus-sync'
        },
        {
            title: 'AI Semen Handling, Storage & Thawing',
            host: 'Dr. Carlos Santos · PhilVet',
            dateTime: 'May 29, 10:00 AM',
            status: 'Upcoming',
            registrants: 23,
            videoLink: 'https://meet.jit.si/philsar-semen-handling'
        },
        {
            title: 'Bull Selection & Genetic Evaluation',
            host: 'Dr. James Lim · UPLB',
            dateTime: 'June 1, 9:00 AM',
            status: 'Upcoming',
            registrants: 12,
            videoLink: 'https://meet.jit.si/philsar-bull-selection'
        },
        {
            title: 'Postpartum Care and Return to Estrus',
            host: 'Dr. Ana Torres · VSO',
            dateTime: 'May 20 · Recorded',
            status: 'Ended',
            registrants: 58,
            videoLink: 'https://meet.jit.si/philsar-postpartum-care'
        },
        {
            title: 'Common Reproductive Disorders in Cattle',
            host: 'Dr. Rodel Cruz · CLSU',
            dateTime: 'May 15 · Recorded',
            status: 'Ended',
            registrants: 89,
            videoLink: 'https://meet.jit.si/philsar-disorders'
        }
    ];

    try {
        for (const meeting of defaultMeetings) {
            await Meeting.findOrCreate({
                where: { title: meeting.title },
                defaults: meeting
            });
        }
        console.log('Meetings seeded successfully.');
    } catch (err) {
        console.error('Error seeding meetings:', err);
    }

    // 4. Seed Default Users
    const defaultUsers = [
        {
            name: 'James Kevin Santos',
            email: 'jameskevin@gmail.com',
            password: 'password123',
            role: 'Livestock Manager',
            organization: 'Santos Cattle Farm, Bical, Mabalacat',
            status: 'Active',
            modulesCompleted: 4,
            seminarsAttended: 3,
            dssAssessmentsRun: 7
        },
        {
            name: 'Maria Reyes',
            email: 'mariareyes@gmail.com',
            password: 'password123',
            role: 'Veterinarian',
            organization: 'Department of Agriculture - BAI',
            status: 'Active',
            modulesCompleted: 6,
            seminarsAttended: 5,
            dssAssessmentsRun: 12
        },
        {
            name: 'Carlos Santos',
            email: 'carlossantos@gmail.com',
            password: 'password123',
            role: 'Farmer',
            organization: 'Santos Dairy Herd',
            status: 'Active',
            modulesCompleted: 2,
            seminarsAttended: 1,
            dssAssessmentsRun: 4
        },
        {
            name: 'Ana Torres',
            email: 'anatorres@gmail.com',
            password: 'password123',
            role: 'Extension Worker',
            organization: 'Nueva Ecija Livestock Office',
            status: 'Inactive',
            modulesCompleted: 1,
            seminarsAttended: 0,
            dssAssessmentsRun: 1
        },
        {
            name: 'System Admin',
            email: 'admin@philsar.org',
            password: 'adminpassword',
            role: 'Admin',
            organization: 'PHILSAR Head Office',
            status: 'Active',
            modulesCompleted: 6,
            seminarsAttended: 10,
            dssAssessmentsRun: 25
        }
    ];

    try {
        for (const user of defaultUsers) {
            await User.findOrCreate({
                where: { email: user.email },
                defaults: user
            });
        }
        console.log('Sample users seeded successfully.');
    } catch (err) {
        console.error('Error seeding users:', err);
    }

    console.log('All seeding tasks completed!');
    process.exit();
};

seedData();
