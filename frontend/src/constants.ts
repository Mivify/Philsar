export interface LearningModule {
  id: string;
  title: string;
  description: string;
  content: string;
  category: 'anatomy' | 'physiology' | 'technology';
  icon: string;
}

export const MODULES: LearningModule[] = [
  {
    id: 'female-anatomy',
    title: 'Female Reproductive Anatomy',
    description: 'Detailed overview of the female cattle reproductive organs.',
    category: 'anatomy',
    icon: 'Venus',
    content: `
# Female Reproductive System of Cattle

The female reproductive tract of the cow is located in the pelvic cavity and consists of the following major organs:

## 1. Ovaries
The primary reproductive organs. They produce eggs (ova) and hormones (estrogen and progesterone).

## 2. Oviducts (Fallopian Tubes)
Small, convoluted tubes that transport the egg from the ovary to the uterus. Fertilization typically occurs here.

## 3. Uterus
Consists of two uterine horns and a uterine body. It is the site of fetal development during pregnancy.

## 4. Cervix
A thick-walled, fibrous organ that serves as a gateway between the uterus and the vagina. It protects the uterus from external contaminants.

## 5. Vagina
The birth canal and the site of semen deposition during natural service.

## 6. Vulva
The external opening of the reproductive tract.
    `
  },
  {
    id: 'estrous-cycle',
    title: 'The Estrous Cycle',
    description: 'Understanding the hormonal changes and behavioral signs of heat.',
    category: 'physiology',
    icon: 'Activity',
    content: `
# The Estrous Cycle in Cattle

The estrous cycle is the period between two consecutive heats (estrus). In cows, the average cycle length is **21 days** (range 18-24 days).

## Phases of the Estrous Cycle
1. **Estrus (Day 0):** The period of sexual receptivity ("Heat"). Lasts 12-18 hours.
2. **Metestrus (Days 1-4):** Period after heat. Ovulation occurs 10-15 hours after the end of estrus.
3. **Diestrus (Days 5-17):** The longest phase. The Corpus Luteum (CL) is fully functional, producing progesterone.
4. **Proestrus (Days 18-20):** The CL regresses, and new follicles begin to grow rapidly.

## Signs of Estrus
- Standing to be mounted (the most reliable sign).
- Increased activity and nervousness.
- Clear, viscous mucus discharge from the vulva.
- Swelling and reddening of the vulva.
    `
  },
  {
    id: 'artificial-insemination',
    title: 'Artificial Insemination (AI)',
    description: 'The process and benefits of AI in cattle breeding.',
    category: 'technology',
    icon: 'Syringe',
    content: `
# Artificial Insemination (AI)

Artificial Insemination is the manual placement of semen into the female reproductive tract by methods other than natural mating.

## Benefits of AI
- **Genetic Improvement:** Allows the use of superior sires across many herds.
- **Disease Control:** Reduces the risk of spreading sexually transmitted diseases.
- **Safety:** Eliminates the need to keep dangerous bulls on the farm.
- **Cost-Effective:** Often cheaper than maintaining a high-quality bull.

## The AI Process
1. **Heat Detection:** Accurate timing is crucial.
2. **Semen Thawing:** Frozen semen straws are thawed in a water bath (35-37°C) for 30-40 seconds.
3. **Insemination:** The AI technician passes the insemination gun through the cervix and deposits semen in the uterine body.
    `
  },
  {
    id: 'embryo-transfer',
    title: 'Embryo Transfer (ET)',
    description: 'Advanced breeding technology for rapid genetic progress.',
    category: 'technology',
    icon: 'Layers',
    content: `
# Embryo Transfer in Cattle

Embryo Transfer (ET) involves the collection of embryos from a genetically superior "donor" cow and transferring them into "recipient" cows.

## Key Steps in ET
1. **Superovulation:** The donor cow is treated with hormones to produce multiple eggs.
2. **Insemination:** The donor is inseminated with high-quality semen.
3. **Flushing:** Embryos are non-surgically removed from the donor's uterus 7 days after insemination.
4. **Evaluation:** Embryos are graded for quality.
5. **Transfer:** Quality embryos are transferred to synchronized recipient cows or frozen for later use.

## Advantages
- Increases the number of offspring from a single superior female.
- Allows for international trade of genetics via frozen embryos.
    `
  }
];
