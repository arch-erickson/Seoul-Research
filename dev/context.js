// Grey placeholders approximating the HTML the MAIN session lays out around each diagram region
// (from spec/diagram-briefs.md "HTML around"). Dev-only, shown with &ctx=1, to judge composition.
const H = (t, y = 110, w = 1720, size = 86) => ({ x: 100, y, w, h: size * 1.05, t, font: `900 ${size}px/1 Montserrat`, color: '#111112' });
const box = (x, y, w, h, t) => ({ x, y, w, h, t });

export default {
  's10-edc': [H('Zero energy. Built on a landfill.'), box(1240, 330, 580, 120, '3,500 m²'), box(1240, 480, 580, 120, '280,000 kWh / yr'), box(1240, 630, 580, 120, 'Geothermal'), box(1240, 780, 580, 120, 'KGBC + PH')],
  's01-map': [{ x: 100, y: 330, w: 1100, h: 200, t: 'SEOUL', font: '900 180px/1 Montserrat', color: '#111112' }, box(100, 560, 1000, 80, 'The Carrot and the Stick'), box(100, 860, 700, 60, 'Erickson Cabrera · ARCH 3551')],
  's03-map': [H('Two-thirds of the problem is already built.'), box(1300, 880, 520, 70, 'Seoul is 0.6% of South Korea’s land area and 18% of its population.')],
  's03-donut': [H('Two-thirds of the problem is already built.'), box(700, 470, 420, 260, 'legend: Buildings 67% · Transportation 18% · Waste & other 15%')],
  's12-towers': [H('Two ways to build big.'), box(120, 348, 760, 56, 'AMOREPACIFIC HQ + subline'), box(1010, 348, 760, 56, 'LOTTE WORLD TOWER + subline'), box(120, 856, 220, 34, 'LEED GOLD'), box(1010, 856, 220, 34, 'LEED GOLD'), box(100, 900, 1720, 60, 'judgment line')],
  's14-nanjido': [H('90 metres of garbage.'), box(1120, 300, 700, 660, 'timeline column 1978 / 1993 / 2002 / 2012 / Freshkills')],
  's07-balcony': [H('The balcony as power plant.'), box(900, 330, 920, 640, '540,000 balconies · 357.1 MW / 1 GW · US$1.46 bn · barrier')],
  's11-nowon': [H('121 units. Net zero.'), box(1030, 320, 790, 620, '121 units · MOLIT R&D · Passive House cert. · 75–80% · −61%')],
  's13-rfid': [H('Your trash is weighed. And billed.'), box(1360, 410, 460, 450, '9–31%'), box(100, 906, 1720, 50, 'lesson line')],
  's16-cheonggye': [H('168,000 cars a day. Removed.'), box(1130, 320, 690, 300, 'species bars'), box(100, 636, 940, 124, '−35% · 3.3–5.9°C'), box(100, 800, 1720, 60, 'closing line')],
  's15-export': [H('Seoul’s trash now travels 130 kilometres.'), box(100, 300, 660, 640, 'stats column')],
  's06-reactor': [H('Seoul decided not to need a power plant.'), box(1200, 420, 620, 420, 'result panel 2.04M TOE · 79% / 21%'), box(100, 872, 1720, 60, 'closing quote')],
  's09-zeb': [H('Grade 5 to Grade 1.'), box(990, 320, 830, 620, 'rollout list')],
  's17-parks': [H('A garden within five minutes.'), box(700, 330, 560, 600, 'programme'), box(1290, 330, 530, 600, 'rooftops')],
  's05-trajectory': [H('Half by 2033. Zero by 2050.'), box(960, 320, 860, 620, 'car phase-out ladder · 279,000 EVs')],
  's18-buslane': [H('₩65,000. Everything.'), box(100, 648, 800, 200, '+11 km/h · −24% · fare integration'), box(960, 330, 860, 560, 'Climate Card column')],
  's04-timeline': [H('Two emergencies.'), box(100, 886, 1720, 60, 'closing line')],
};
