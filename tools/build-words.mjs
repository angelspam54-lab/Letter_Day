// Builds Letter Day's answer lists from open datasets:
//   WordNet 3.1 (Princeton; WordNet licence) — animals, things, foods, places and bonus categories,
//     by walking each root concept's hyponym tree ("is a kind of").
//   human-names (MIT) — first names; all-the-cities (CC-BY GeoNames) — cities ≥ 20k people;
//   world-countries (ODbL) — countries, alt spellings and capitals.
// Output: server/src/data/words/<category>.txt, one display form per line.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const DICT = new URL('./node_modules/wordnet-db/dict/', import.meta.url);
const OUT = new URL('../server/src/data/words/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// ---------- WordNet ----------
const data = new Map(); // offset -> { words: string[], hypo: string[], gloss }
for (const line of readFileSync(new URL('data.noun', DICT), 'utf8').split('\n')) {
  if (!line || line.startsWith(' ')) continue;
  const [head, gloss = ''] = line.split(' | ');
  const t = head.split(' ');
  const offset = t[0];
  const wcnt = parseInt(t[3], 16);
  const words = [];
  for (let i = 0; i < wcnt; i++) words.push(t[4 + i * 2].replace(/\(.*\)$/, '').replace(/_/g, ' '));
  let k = 4 + wcnt * 2;
  const pcnt = parseInt(t[k], 10); k++;
  const hypo = [];
  for (let i = 0; i < pcnt; i++, k += 4) if (t[k] === '~' || t[k] === '~i') hypo.push(t[k + 1]);
  data.set(offset, { words, hypo, gloss });
}
const index = new Map(); // lemma -> offsets in sense order
for (const line of readFileSync(new URL('index.noun', DICT), 'utf8').split('\n')) {
  if (!line || line.startsWith(' ')) continue;
  const t = line.trim().split(' ');
  const synCnt = parseInt(t[2], 10);
  index.set(t[0], t.slice(t.length - synCnt));
}

/** Synset by lemma + a word that must appear in its gloss (robust to sense renumbering). */
function synset(lemma, glossHint) {
  const offs = index.get(lemma.replace(/ /g, '_')) ?? [];
  const hit = offs.find((o) => !glossHint || data.get(o).gloss.toLowerCase().includes(glossHint));
  if (!hit) throw new Error(`No synset for ${lemma} / ${glossHint}`);
  return hit;
}

function closure(roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const o = stack.pop();
    if (seen.has(o)) continue;
    seen.add(o);
    stack.push(...(data.get(o)?.hypo ?? []));
  }
  return seen;
}

const BINOMIAL = /^[A-Z][a-z]+ [a-z]+( [a-z]+)?$/; // e.g. "Panthera leo"
function words(roots, { proper = 'allow', maxWords = 3, exclude = [] } = {}) {
  const ex = new Set(exclude.flatMap((r) => [...closure([r])]));
  const out = new Set();
  for (const o of closure(roots)) {
    if (ex.has(o)) continue;
    for (const w of data.get(o).words) {
      if (!/^[A-Za-z][A-Za-z' .-]*$/.test(w)) continue;
      if (w.split(' ').length > maxWords || w.length < 2) continue;
      if (BINOMIAL.test(w)) continue;
      const isProper = /^[A-Z]/.test(w);
      if (proper === 'none' && isProper) continue;
      if (proper === 'only' && !isProper) continue;
      out.add(w);
    }
  }
  return out;
}

const S = synset;
const cats = {};

cats.animal = words([S('animal', 'living organism')], { maxWords: 3 });
cats.food = words([S('food', 'metabolized'), S('food', 'solid substance'), S('dish', 'particular item of prepared food'), S('beverage', 'liquid'), S('edible fruit', ''), S('vegetable', ''), S('edible nut', ''), S('herb', 'aromatic potherb')]);
cats.thing = words([S('artifact', 'man-made object'), S('natural object', ''), S('plant part', ''), S('substance', 'particular kind or species')], { proper: 'none', maxWords: 2 });
const locationRoots = [S('location', 'point or extent in space')];
cats.place = words(locationRoots, { proper: 'only', maxWords: 4 });

// Bonus categories (rotate daily)
cats.colour = words([S('chromatic color', ''), S('achromatic color', '')], { proper: 'none' });
cats.job = words([S('worker', 'person who works at a specific'), S('professional', 'learned profession'), S('skilled worker', '')], { proper: 'none', maxWords: 2 });
cats.sport = words([S('sport', 'active diversion'), S('game', 'contest with rules')], { proper: 'none', maxWords: 3 });
cats.instrument = words([S('musical instrument', '')], { proper: 'none' });
cats.bodypart = words([S('body part', '')], { proper: 'none', maxWords: 2 });
cats.clothing = words([S('clothing', 'covering designed to be worn'), S('footwear', 'covering for a person')], { proper: 'none', maxWords: 2 });
cats.vehicle = words([S('vehicle', 'conveyance')], { proper: 'none', maxWords: 2 });
cats.drink = words([S('beverage', 'liquid')], { maxWords: 3 });
cats.plant = words([S('flower', 'cultivated for its blooms'), S('tree', 'tall perennial'), S('herb', 'lacking a permanent woody stem'), S('shrub', '')], { maxWords: 2 });
cats.bird = words([S('bird', 'warm-blooded')], { maxWords: 2 });
cats.tool = words([S('tool', 'implement used in the practice'), S('hand tool', '')], { proper: 'none', maxWords: 2 });
cats.furniture = words([S('furniture', 'furnishings')], { proper: 'none', maxWords: 2 });

// ---------- Names ----------
const hn = require('human-names');
const names = new Set([...hn.allEn, ...hn.allIt, ...hn.allFr, ...hn.allDe, ...hn.allEs, ...hn.allNl]);
// Common African given names the European-centric lists miss (Yoruba, Igbo, Hausa, Akan, Swahili, Zulu, Amharic).
for (const n of `Ada Adaeze Adaobi Adebayo Adekunle Adenike Adeola Adesuwa Adetola Adewale Ayodele Ayomide Ayotunde Abiodun Abimbola Babajide Bisi Bola Bolanle Bukola Damilola Dayo Dele Dotun Fela Femi Folake Folasade Funke Funmilayo Gbenga Ibukun Ife Ifeoluwa Ifeoma Jumoke Kayode Kehinde Kemi Kunle Lanre Lola Lolade Moji Morenike Niyi Olu Oluwaseun Olamide Olumide Seun Shola Sola Taiwo Temi Temitope Tobi Tola Tolu Tope Tunde Wale Wunmi Yemi Yetunde Yinka Chidi Chidinma Chika Chiamaka Chibuike Chinedu Chinonso Chioma Chukwuemeka Chukwudi Ebuka Emeka Ezinne Ifeanyi Ikenna Kelechi Ngozi Nkechi Nkem Nnamdi Obinna Obiageli Okechukwu Onyeka Uche Uchenna Ugochi Somto Tochukwu Amaka Adamu Aisha Amina Bello Fatima Garba Hadiza Halima Hauwa Ibrahim Idris Jamila Kabiru Lawal Musa Nafisa Sani Usman Yusuf Zainab Zara Kwame Kofi Kojo Kwaku Kwabena Yaw Ama Akosua Abena Efua Esi Afua Adwoa Akua Yaa Nana Amani Baraka Faraji Imani Jabari Juma Kamau Neema Wanjiru Zawadi Thabo Sipho Themba Nomvula Lindiwe Zanele Thandiwe Abebe Almaz Tigist Dawit Selam Kemi Eniola Oyin Oyinda Remi Simi Tiwa Wizkid Sade Nneka Ozioma Nonso Ebere Chinwe Ijeoma Adanna Obi Okoro Eze Ada`.split(/\s+/)) names.add(n);
cats.name = names;

// ---------- Places: WordNet geography + countries + cities ----------
const countries = require('world-countries');
const countryNames = new Set();
for (const c of countries) {
  countryNames.add(c.name.common);
  countryNames.add(c.name.official);
  for (const a of c.altSpellings ?? []) if (a.length > 3 && /^[A-Za-z][A-Za-z' .-]+$/.test(a)) countryNames.add(a);
  for (const cap of c.capital ?? []) cats.place.add(cap);
}
for (const n of countryNames) cats.place.add(n);
for (const city of require('all-the-cities')) {
  if (city.population >= 20000 && /^[A-Za-z][A-Za-z' .-]*$/.test(city.name) && city.name.split(' ').length <= 4) cats.place.add(city.name);
}
for (const p of 'Africa,Asia,Europe,Antarctica,Australia,Oceania,North America,South America,Atlantic Ocean,Pacific Ocean,Indian Ocean,Arctic Ocean,Southern Ocean,Sahara,Lagos Island,Victoria Island,Lekki,Ikeja,Yaba,Surulere,Ikoyi,Ajah,Festac,Abuja,Port Harcourt,Enugu,Ibadan,Kano,Kaduna,Jos,Calabar,Benin City,Owerri,Onitsha,Abeokuta,Uyo,Warri,Ilorin,Akure,Asaba,Awka,Umuahia,Yola,Maiduguri,Sokoto,Zaria,Bauchi,Gombe,Lafia,Lokoja,Makurdi,Minna,Osogbo,Ado Ekiti,Abakaliki,Yenagoa,Jalingo,Damaturu,Dutse,Birnin Kebbi,Gusau,Katsina,Nsukka,Ogbomosho,Ife,Ile-Ife,Ijebu Ode,Badagry,Epe,Ikorodu,Agege,Oshodi,Mushin,Kaduna,Kafanchan,Keffi,Kontagora'.split(',')) cats.place.add(p.trim());
cats.country = countryNames;

// Extra foods worth knowing (West African and other dishes WordNet lacks)
for (const f of 'jollof,jollof rice,egusi,egusi soup,amala,suya,fufu,moi moi,moin moin,akara,puff puff,chin chin,eba,pounded yam,ogbono,ogbono soup,efo riro,dodo,boli,kilishi,tuwo,tuwo shinkafa,ofada rice,abacha,nkwobi,isi ewu,pepper soup,garri,zobo,kunu,banga soup,okra soup,edikang ikong,afang soup,ewedu,gbegiri,ewa agoyin,yam porridge,plantain,fried rice,meat pie,shawarma,kebab,kenkey,banku,waakye,kelewele,injera,ugali,nyama choma,bobotie,biltong,tagine,couscous,sushi,ramen,pho,kimchi,bibimbap,dim sum,dumpling,taco,burrito,nachos,quesadilla,lasagna,lasagne,risotto,paella,falafel,hummus,biryani,samosa,naan,curry,pad thai,tom yum,croissant,baguette,waffle,pancake,doughnut,donut,cupcake,brownie,cheesecake,tiramisu,gelato,popcorn,pretzel,bagel,muffin,noodles,indomie,spaghetti,macaroni,beans,bread,yam,rice,cake,chicken,beef,fish,goat meat,kpomo,ponmo,asun,gizdodo,yamarita,agege bread,akamu,pap,ogi,custard,cornflakes,oats,kunun gyada'.split(',')) cats.food.add(f);

// ---------- curated top-ups for everyday answers the dictionary files elsewhere ----------
const add = (k, txt) => { for (const w of txt.split(',')) if (w.trim()) cats[k].add(w.trim()); };
add('job', 'engineer,farmer,banker,accountant,architect,actor,actress,artist,baker,barber,builder,butcher,cashier,cleaner,dentist,designer,developer,driver,economist,editor,electrician,fisherman,footballer,gardener,hairdresser,journalist,judge,janitor,jeweller,jeweler,keeper,lecturer,librarian,mechanic,midwife,model,musician,nanny,optician,painter,pharmacist,photographer,physician,plumber,police officer,policeman,policewoman,porter,postman,professor,programmer,receptionist,reporter,sailor,salesman,scientist,secretary,security guard,singer,soldier,surgeon,tailor,taxi driver,technician,trader,tutor,veterinarian,vet,waiter,waitress,welder,writer,youth worker,zookeeper,kitchen porter,nutritionist,optometrist,paramedic,pastor,priest,imam,quantity surveyor,radiographer,realtor,surveyor,underwriter,usher,vendor,web designer,x-ray technician,yoga teacher,zoologist,banker,cook,doctor,nurse,teacher');
add('sport', 'karate,kickboxing,judo,taekwondo,kung fu,wrestling,boxing,athletics,badminton,baseball,volleyball,handball,hockey,ice hockey,rugby,golf,swimming,cycling,rowing,sailing,surfing,skiing,snowboarding,skating,squash,table tennis,ping pong,polo,netball,fencing,archery,gymnastics,marathon,triathlon,darts,snooker,pool,bowling,kayaking,karting,kitesurfing,lacrosse,motor racing,formula one,climbing,diving,water polo,weightlifting,yoga');
add('colour', 'khaki,beige,cream,gold,silver,bronze,navy,teal,turquoise,lilac,lavender,magenta,maroon,mauve,olive,peach,pink,plum,rust,saffron,salmon,scarlet,tan,ivory,indigo,jade,lemon,lime,mint,mustard,ochre,amber,aqua,burgundy,charcoal,coral,crimson,cyan,emerald,fuchsia,grey,gray,ruby,sapphire,violet,wine,yellow,orange,brown,black,white,kelly green,keppel');
add('instrument', 'keyboard,kalimba,kora,talking drum,djembe,shekere,saxophone,trumpet,trombone,violin,cello,flute,clarinet,harp,ukulele,banjo,accordion,harmonica,xylophone,organ,synthesizer,bass guitar,tambourine,triangle,maracas,bongo,conga,oboe,bassoon,tuba,piccolo,recorder,sitar,mandolin,lute,bagpipes,cymbal,gong');
add('name', 'Precious,Blessing,Favour,Favor,Godwin,Gift,Goodluck,Peace,Joy,Mercy,Patience,Prudence,Faith,Hope,Charity,Comfort,Destiny,Divine,Emmanuel,Esther,Victor,Victoria,Princess,Prince,Sunday,Monday,Friday,Kingsley,Kenneth,Kennedy,Kelvin,Kingsley,Kayla,Kiara,Khadija,Khalid,Karim,Kareem,Keisha,Kenji,Kimberly,Kylie,Kyle,Liam,Noah,Olivia,Emma,Ava,Mia,Zion,Wisdom,Testimony,Treasure,Success,Goodness,Gideon,Daniel,David,Samuel,Michael,Mohammed,Muhammad,Ahmad,Ali,Hassan,Hussein,Omar,Fatimah,Maryam,Aaliyah,Jayden,Jordan,Tyler,Xavier,Ximena,Yasmin,Yvonne,Zoe,Quincy,Queen,Quentin,Uriel,Ursula,Ulrich,Uduak,Uche,Ifiok,Inemesit');
add('thing', 'phone,laptop,tablet,charger,headphones,earphones,remote,television,tv,fridge,freezer,microwave,kettle,keyboard,key,keyring,kite,knife,kerosene lamp,kennel,kayak,ketchup bottle,kiosk,kit,kitchen,kimono');
add('animal', 'kangaroo,koala,kudu,kiwi,kingfisher,kitten,kid,kestrel,krill,komodo dragon,kookaburra,killer whale,king cobra,kinkajou,katydid,koi');
add('plant', 'rose,tulip,sunflower,lily,daisy,orchid,hibiscus,bougainvillea,mango tree,palm tree,baobab,iroko,kola nut tree,kale');
add('vehicle', 'car,bus,taxi,keke,okada,motorcycle,bicycle,bike,truck,lorry,van,train,tram,plane,aeroplane,airplane,helicopter,boat,ship,ferry,kayak,canoe,scooter,tractor,ambulance,jeep,limousine,rickshaw,tricycle');
add('drink', 'kunu,zobo,palm wine,chapman,malt,coke,cola,fanta,sprite,juice,smoothie,milkshake,kombucha,kefir,kvass,coffee,tea,water,soda,lemonade,wine,beer,whisky,vodka');

// ---------- write ----------
const clean = (set) => [...new Set([...set].map((w) => w.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const stats = {};
for (const [k, set] of Object.entries(cats)) {
  const list = clean(set);
  stats[k] = list.length;
  writeFileSync(new URL(`${k}.txt`, OUT), list.join('\n') + '\n');
}
console.log(stats);
