const { connectDB, sequelize } = require('./config/db');
const Module = require('./models/Module');

const seedModules = async () => {
    await connectDB();

    const modulesToSeed = [
        {
            title: 'Introduction to Bovine Reproduction',
            description: 'Learn the basic anatomy and physiology of cattle reproductive systems.',
            content: 'The reproductive system of the cow consists of the ovaries, oviducts, uterus, cervix, vagina, and vulva...',
            imageUrl: 'https://images.unsplash.com/photo-1596733430284-f74371912ed4?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Artificial Insemination (AI) Techniques',
            description: 'Step-by-step guide to modern artificial insemination in cattle.',
            content: 'Artificial insemination allows farmers to utilize genetics from top bulls without the cost of ownership...',
            imageUrl: 'https://images.unsplash.com/photo-1543851508-dd1d85b1a646?auto=format&fit=crop&q=80&w=600'
        },
        {
            title: 'Estrous Synchronization Protocols',
            description: 'Understanding hormones and timing for optimal breeding success.',
            content: 'Estrous synchronization involves manipulating the estrous cycle of the cow using hormones like Prostaglandin and GnRH...',
            imageUrl: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&q=80&w=600'
        }
    ];

    try {
        await Module.bulkCreate(modulesToSeed);
        console.log('Sample modules inserted successfully!');
    } catch (err) {
        console.error('Error seeding modules:', err);
    } finally {
        process.exit();
    }
};

seedModules();
