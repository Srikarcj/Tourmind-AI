import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve(process.cwd(), "tourmind-api/src/data/tourismData.json");

const slugify = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const categoryBestTime = {
  Temple: "October to March",
  Historical: "October to March",
  Hill: "March to June and September to November",
  Beach: "November to February",
  Wildlife: "November to April",
  Nature: "October to March",
  City: "October to March",
  Island: "November to April",
  Desert: "October to March",
  Lake: "October to March"
};

const categoryTips = {
  Temple: [
    "Dress modestly and respect local customs.",
    "Visit during early hours to avoid heavy queues.",
    "Keep footwear and valuables in designated counters."
  ],
  Historical: [
    "Use certified guides for better historical context.",
    "Carry water and sun protection for daytime visits.",
    "Follow site conservation and photography rules."
  ],
  Hill: [
    "Carry layered clothing for temperature changes.",
    "Check weather and road conditions before departure.",
    "Plan buffer time for hilly route traffic."
  ],
  Beach: [
    "Swim only in lifeguard-marked zones.",
    "Avoid peak afternoon sun and stay hydrated.",
    "Keep electronics protected from sand and splash."
  ],
  Wildlife: [
    "Book safaris or permits in advance during peak season.",
    "Maintain silence and distance from animals.",
    "Follow ranger instructions at all times."
  ],
  Nature: [
    "Carry light snacks, water, and basic first aid.",
    "Use non-slip footwear on uneven trails.",
    "Avoid littering and protect local ecosystems."
  ],
  City: [
    "Start early to cover major attractions smoothly.",
    "Prefer metro or rideshare in dense traffic zones.",
    "Keep small cash for local markets and transport."
  ],
  Island: [
    "Check ferry schedules and weather alerts in advance.",
    "Carry sunscreen and reusable water bottles.",
    "Respect marine life and reef protection guidelines."
  ],
  Desert: [
    "Carry hats, sunglasses, and hydration support.",
    "Plan sunrise/sunset slots for best weather.",
    "Confirm transport availability for remote stretches."
  ],
  Lake: [
    "Prefer guided boating in authorized zones.",
    "Visit during clear daylight for safer navigation.",
    "Keep weatherproof jackets for evening breeze."
  ]
};

const regionSeeds = [
  {
    code: "AP",
    slug: "andhra-pradesh",
    name: "Andhra Pradesh",
    center: { lat: 15.9129, lng: 79.74 },
    places: [
      ["Tirupati Balaji Temple", "Temple"],
      ["Araku Valley", "Hill"],
      ["Borra Caves", "Nature"],
      ["RK Beach, Visakhapatnam", "Beach"],
      ["Gandikota", "Historical"]
    ]
  },
  {
    code: "AR",
    slug: "arunachal-pradesh",
    name: "Arunachal Pradesh",
    center: { lat: 28.218, lng: 94.7278 },
    places: [
      ["Tawang Monastery", "Historical"],
      ["Ziro Valley", "Hill"],
      ["Namdapha National Park", "Wildlife"],
      ["Sela Pass", "Nature"],
      ["Bomdila", "Hill"]
    ]
  },
  {
    code: "AS",
    slug: "assam",
    name: "Assam",
    center: { lat: 26.2006, lng: 92.9376 },
    places: [
      ["Kaziranga National Park", "Wildlife"],
      ["Kamakhya Temple", "Temple"],
      ["Majuli", "Nature"],
      ["Manas National Park", "Wildlife"],
      ["Sivasagar", "Historical"]
    ]
  },
  {
    code: "BR",
    slug: "bihar",
    name: "Bihar",
    center: { lat: 25.0961, lng: 85.3131 },
    places: [
      ["Mahabodhi Temple, Bodh Gaya", "Temple"],
      ["Nalanda Ruins", "Historical"],
      ["Rajgir", "Historical"],
      ["Vikramshila", "Historical"],
      ["Patna Sahib", "Temple"]
    ]
  },
  {
    code: "CG",
    slug: "chhattisgarh",
    name: "Chhattisgarh",
    center: { lat: 21.2787, lng: 81.8661 },
    places: [
      ["Chitrakote Falls", "Nature"],
      ["Kanger Valley National Park", "Wildlife"],
      ["Tirathgarh Falls", "Nature"],
      ["Barnawapara Wildlife Sanctuary", "Wildlife"],
      ["Sirpur", "Historical"]
    ]
  },
  {
    code: "GA",
    slug: "goa",
    name: "Goa",
    center: { lat: 15.2993, lng: 74.124 },
    places: [
      ["Calangute Beach", "Beach"],
      ["Baga Beach", "Beach"],
      ["Dudhsagar Falls", "Nature"],
      ["Fort Aguada", "Historical"],
      ["Old Goa Churches", "Historical"]
    ]
  },
  {
    code: "GJ",
    slug: "gujarat",
    name: "Gujarat",
    center: { lat: 22.2587, lng: 71.1924 },
    places: [
      ["Statue of Unity", "Historical"],
      ["Gir National Park", "Wildlife"],
      ["Rann of Kutch", "Desert"],
      ["Somnath Temple", "Temple"],
      ["Dwarka", "Temple"]
    ]
  },
  {
    code: "HR",
    slug: "haryana",
    name: "Haryana",
    center: { lat: 29.0588, lng: 76.0856 },
    places: [
      ["Brahma Sarovar, Kurukshetra", "Temple"],
      ["Sultanpur National Park", "Wildlife"],
      ["Pinjore Gardens", "Historical"],
      ["Morni Hills", "Hill"],
      ["Kingdom of Dreams", "City"]
    ]
  },
  {
    code: "HP",
    slug: "himachal-pradesh",
    name: "Himachal Pradesh",
    center: { lat: 31.1048, lng: 77.1734 },
    places: [
      ["Manali", "Hill"],
      ["Shimla", "Hill"],
      ["Dharamshala", "Hill"],
      ["Spiti Valley", "Nature"],
      ["Kasol", "Hill"]
    ]
  },
  {
    code: "JH",
    slug: "jharkhand",
    name: "Jharkhand",
    center: { lat: 23.6102, lng: 85.2799 },
    places: [
      ["Hundru Falls", "Nature"],
      ["Betla National Park", "Wildlife"],
      ["Netarhat", "Hill"],
      ["Baidyanath Temple, Deoghar", "Temple"],
      ["Dassam Falls", "Nature"]
    ]
  },
  {
    code: "KA",
    slug: "karnataka",
    name: "Karnataka",
    center: { lat: 15.3173, lng: 75.7139 },
    places: [
      ["Hampi", "Historical"],
      ["Coorg", "Hill"],
      ["Mysore Palace", "Historical"],
      ["Gokarna Beach", "Beach"],
      ["Jog Falls", "Nature"]
    ]
  },
  {
    code: "KL",
    slug: "kerala",
    name: "Kerala",
    center: { lat: 10.8505, lng: 76.2711 },
    places: [
      ["Munnar", "Hill"],
      ["Alleppey Backwaters", "Nature"],
      ["Wayanad", "Hill"],
      ["Kovalam Beach", "Beach"],
      ["Thekkady", "Wildlife"]
    ]
  },
  {
    code: "MP",
    slug: "madhya-pradesh",
    name: "Madhya Pradesh",
    center: { lat: 22.9734, lng: 78.6569 },
    places: [
      ["Khajuraho Group of Monuments", "Historical"],
      ["Sanchi Stupa", "Historical"],
      ["Bandhavgarh National Park", "Wildlife"],
      ["Pachmarhi", "Hill"],
      ["Orchha", "Historical"]
    ]
  },
  {
    code: "MH",
    slug: "maharashtra",
    name: "Maharashtra",
    center: { lat: 19.7515, lng: 75.7139 },
    places: [
      ["Ajanta and Ellora Caves", "Historical"],
      ["Gateway of India", "Historical"],
      ["Mahabaleshwar", "Hill"],
      ["Lonavala", "Hill"],
      ["Tadoba National Park", "Wildlife"]
    ]
  },
  {
    code: "MN",
    slug: "manipur",
    name: "Manipur",
    center: { lat: 24.6637, lng: 93.9063 },
    places: [
      ["Loktak Lake", "Lake"],
      ["Keibul Lamjao National Park", "Wildlife"],
      ["Kangla Fort", "Historical"],
      ["Shirui Hills", "Hill"],
      ["Moirang", "Historical"]
    ]
  },
  {
    code: "ML",
    slug: "meghalaya",
    name: "Meghalaya",
    center: { lat: 25.467, lng: 91.3662 },
    places: [
      ["Cherrapunji", "Hill"],
      ["Shillong Peak", "Hill"],
      ["Dawki", "Nature"],
      ["Nongriat Root Bridge", "Nature"],
      ["Mawlynnong", "Nature"]
    ]
  },
  {
    code: "MZ",
    slug: "mizoram",
    name: "Mizoram",
    center: { lat: 23.1645, lng: 92.9376 },
    places: [
      ["Aizawl Viewpoints", "Hill"],
      ["Reiek", "Nature"],
      ["Vantawng Falls", "Nature"],
      ["Phawngpui National Park", "Wildlife"],
      ["Tam Dil", "Lake"]
    ]
  },
  {
    code: "NL",
    slug: "nagaland",
    name: "Nagaland",
    center: { lat: 26.1584, lng: 94.5624 },
    places: [
      ["Dzukou Valley", "Hill"],
      ["Kohima War Cemetery", "Historical"],
      ["Khonoma Village", "Nature"],
      ["Japfu Peak", "Hill"],
      ["Mokokchung", "Nature"]
    ]
  },
  {
    code: "OD",
    slug: "odisha",
    name: "Odisha",
    center: { lat: 20.9517, lng: 85.0985 },
    places: [
      ["Konark Sun Temple", "Temple"],
      ["Puri Beach", "Beach"],
      ["Chilika Lake", "Lake"],
      ["Lingaraj Temple", "Temple"],
      ["Simlipal National Park", "Wildlife"]
    ]
  },
  {
    code: "PB",
    slug: "punjab",
    name: "Punjab",
    center: { lat: 31.1471, lng: 75.3412 },
    places: [
      ["Golden Temple, Amritsar", "Temple"],
      ["Wagah Border", "Historical"],
      ["Anandpur Sahib", "Temple"],
      ["Jallianwala Bagh", "Historical"],
      ["Sheesh Mahal, Patiala", "Historical"]
    ]
  },
  {
    code: "RJ",
    slug: "rajasthan",
    name: "Rajasthan",
    center: { lat: 27.0238, lng: 74.2179 },
    places: [
      ["Amber Fort, Jaipur", "Historical"],
      ["City Palace, Udaipur", "Historical"],
      ["Jaisalmer Fort", "Historical"],
      ["Mount Abu", "Hill"],
      ["Pushkar", "Temple"]
    ]
  },
  {
    code: "SK",
    slug: "sikkim",
    name: "Sikkim",
    center: { lat: 27.533, lng: 88.5122 },
    places: [
      ["Tsomgo Lake", "Lake"],
      ["Gangtok MG Marg", "City"],
      ["Pelling", "Hill"],
      ["Yumthang Valley", "Nature"],
      ["Nathula Pass", "Nature"]
    ]
  },
  {
    code: "TN",
    slug: "tamil-nadu",
    name: "Tamil Nadu",
    center: { lat: 11.1271, lng: 78.6569 },
    places: [
      ["Meenakshi Amman Temple, Madurai", "Temple"],
      ["Ooty", "Hill"],
      ["Kanyakumari", "Beach"],
      ["Mahabalipuram", "Historical"],
      ["Rameswaram", "Temple"]
    ]
  },
  {
    code: "TS",
    slug: "telangana",
    name: "Telangana",
    center: { lat: 18.1124, lng: 79.0193 },
    places: [
      ["Charminar", "Historical"],
      ["Golconda Fort", "Historical"],
      ["Ramoji Film City", "City"],
      ["Warangal Fort", "Historical"],
      ["Yadadri Temple", "Temple"]
    ]
  },
  {
    code: "TR",
    slug: "tripura",
    name: "Tripura",
    center: { lat: 23.9408, lng: 91.9882 },
    places: [
      ["Ujjayanta Palace", "Historical"],
      ["Neermahal", "Historical"],
      ["Unakoti", "Historical"],
      ["Sepahijala Wildlife Sanctuary", "Wildlife"],
      ["Jampui Hills", "Hill"]
    ]
  },
  {
    code: "UP",
    slug: "uttar-pradesh",
    name: "Uttar Pradesh",
    center: { lat: 26.8467, lng: 80.9462 },
    places: [
      ["Taj Mahal", "Historical"],
      ["Varanasi Ghats", "Temple"],
      ["Ayodhya Ram Mandir", "Temple"],
      ["Fatehpur Sikri", "Historical"],
      ["Dudhwa National Park", "Wildlife"]
    ]
  },
  {
    code: "UK",
    slug: "uttarakhand",
    name: "Uttarakhand",
    center: { lat: 30.0668, lng: 79.0193 },
    places: [
      ["Nainital", "Hill"],
      ["Mussoorie", "Hill"],
      ["Kedarnath", "Temple"],
      ["Valley of Flowers", "Nature"],
      ["Rishikesh", "City"]
    ]
  },
  {
    code: "WB",
    slug: "west-bengal",
    name: "West Bengal",
    center: { lat: 22.9868, lng: 87.855 },
    places: [
      ["Darjeeling", "Hill"],
      ["Sundarbans", "Wildlife"],
      ["Victoria Memorial", "Historical"],
      ["Digha Beach", "Beach"],
      ["Kalimpong", "Hill"]
    ]
  },
  {
    code: "AN",
    slug: "andaman-and-nicobar-islands",
    name: "Andaman and Nicobar Islands",
    center: { lat: 11.7401, lng: 92.6586 },
    places: [
      ["Cellular Jail", "Historical"],
      ["Radhanagar Beach", "Beach"],
      ["Ross Island", "Island"],
      ["Baratang Limestone Caves", "Nature"],
      ["Neil Island", "Island"]
    ]
  },
  {
    code: "CH",
    slug: "chandigarh",
    name: "Chandigarh",
    center: { lat: 30.7333, lng: 76.7794 },
    places: [
      ["Sukhna Lake", "Lake"],
      ["Rock Garden", "City"],
      ["Zakir Hussain Rose Garden", "Nature"],
      ["Capitol Complex", "Historical"]
    ]
  },
  {
    code: "DH",
    slug: "dadra-and-nagar-haveli-and-daman-and-diu",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    center: { lat: 20.3974, lng: 72.8328 },
    places: [
      ["Daman Fort", "Historical"],
      ["Devka Beach", "Beach"],
      ["Silvassa Tribal Museum", "Historical"],
      ["Diu Fort", "Historical"]
    ]
  },
  {
    code: "DL",
    slug: "delhi",
    name: "Delhi",
    center: { lat: 28.7041, lng: 77.1025 },
    places: [
      ["India Gate", "Historical"],
      ["Red Fort", "Historical"],
      ["Qutub Minar", "Historical"],
      ["Lotus Temple", "Temple"],
      ["Humayun's Tomb", "Historical"]
    ]
  },
  {
    code: "JK",
    slug: "jammu-and-kashmir",
    name: "Jammu and Kashmir",
    center: { lat: 33.7782, lng: 76.5762 },
    places: [
      ["Gulmarg", "Hill"],
      ["Pahalgam", "Hill"],
      ["Dal Lake", "Lake"],
      ["Vaishno Devi", "Temple"],
      ["Sonamarg", "Hill"]
    ]
  },
  {
    code: "LA",
    slug: "ladakh",
    name: "Ladakh",
    center: { lat: 34.1526, lng: 77.577 },
    places: [
      ["Pangong Lake", "Lake"],
      ["Nubra Valley", "Nature"],
      ["Khardung La", "Nature"],
      ["Leh Palace", "Historical"],
      ["Tso Moriri", "Lake"]
    ]
  },
  {
    code: "LD",
    slug: "lakshadweep",
    name: "Lakshadweep",
    center: { lat: 10.5667, lng: 72.6417 },
    places: [
      ["Agatti Island", "Island"],
      ["Bangaram Island", "Island"],
      ["Kavaratti", "Island"],
      ["Minicoy Island", "Island"]
    ]
  },
  {
    code: "PY",
    slug: "puducherry",
    name: "Puducherry",
    center: { lat: 11.9416, lng: 79.8083 },
    places: [
      ["Promenade Beach", "Beach"],
      ["Auroville", "City"],
      ["Paradise Beach", "Beach"],
      ["French Quarter", "Historical"],
      ["Aurobindo Ashram", "Temple"]
    ]
  }
];

const latOffsetPattern = [-0.22, -0.08, 0.08, 0.22, 0, 0.15, -0.15];
const lngOffsetPattern = [0.24, -0.16, 0.12, -0.22, 0.04, -0.08, 0.18];

const buildPlace = (state, tuple, index, allTuples) => {
  const [name, category] = tuple;
  const id = `${slugify(name)}-${state.code.toLowerCase()}`;

  const nearbyPlaces = allTuples
    .map(entry => entry[0])
    .filter(placeName => placeName !== name)
    .slice(0, 3);

  const bestTimeToVisit = categoryBestTime[category] || "October to March";
  const travelTips = categoryTips[category] || categoryTips.Nature;

  const lat = Number((state.center.lat + latOffsetPattern[index % latOffsetPattern.length]).toFixed(4));
  const lng = Number((state.center.lng + lngOffsetPattern[index % lngOffsetPattern.length]).toFixed(4));

  return {
    id,
    name,
    category,
    shortDescription: `${name} is a popular ${category.toLowerCase()} destination in ${state.name}.`,
    fullDescription: `${name} is one of the most visited ${category.toLowerCase()} attractions in ${state.name}. It is widely chosen by domestic and international travelers for sightseeing, local culture, and regional travel experiences.`,
    bestTimeToVisit,
    nearbyPlaces,
    travelTips,
    coordinates: { lat, lng }
  };
};

const tourismData = {
  states: regionSeeds.map(state => ({
    code: state.code,
    slug: state.slug,
    name: state.name,
    places: state.places.map((entry, index) => buildPlace(state, entry, index, state.places))
  }))
};

fs.writeFileSync(outputPath, `${JSON.stringify(tourismData, null, 2)}\n`, "utf8");

const placeCount = tourismData.states.reduce((sum, state) => sum + state.places.length, 0);
console.log(`Generated tourismData.json with ${tourismData.states.length} states/UTs and ${placeCount} places.`);
