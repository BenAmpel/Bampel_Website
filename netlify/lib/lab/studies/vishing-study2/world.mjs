// Study 2's fictional world: the Northwind Supply persona card and the company directory
// (vishing-study-persona-directory-draft.md, approved 2026-10-22). Every phone number is in the 555-01xx block,
// which is reserved for fiction. 555-0180 to 555-0199 are numbers an attacker gives out; they are never listed.
// TO DO before launch: check every organization name against real U.S. institutions (FDIC BankFind, NCUA, registries).

export const PERSONA = {
  title: 'You are Alex Morgan, Front Desk Coordinator at Northwind Supply',
  intro: 'Today you are covering the main line for one shift. Handle each call the way a careful, helpful employee would. Everything on this card is fictional and belongs to Northwind; never use your own information.',
  rows: [
    { label: 'Name', value: 'Alex Morgan' },
    { label: 'Title', value: 'Front Desk Coordinator' },
    { label: 'Employee ID', value: 'NW-{{d4}}' },
    { label: 'Desk extension', value: 'x214' },
    { label: 'Northwind portal username', value: 'amorgan' },
    { label: 'Northwind portal password', value: '{{word}}-{{word}}-{{d2}}', secret: 'password' },
    { label: 'Company bank', value: 'Tallgrass Bank, business checking' },
    { label: 'Company account number', value: '{{d10}}', secret: 'account' },
    { label: 'Company card', value: 'Keystone Card Services, ending {{d4}}', note: 'the full number is not on this card' },
    { label: 'Vendor: Clearline Janitorial Products', value: 'V-{{d5}}' },
    { label: 'Vendor: Summit Paper Co.', value: 'V-{{d5}}' },
    { label: 'Vendor: Orchard Office Furniture', value: 'V-{{d5}}' },
    { label: 'Vendor: Bluefin Logistics', value: 'V-{{d5}}' },
    { label: 'Building', value: '2200 Calder Way, Riverton' },
    { label: 'Manager', value: 'Priya Nair, Office Manager, x201' },
    { label: 'One-time codes', value: 'Arrive in the Authenticator on your phone', note: 'a new code each time a service sends one' }
  ]
};

const e = (name, dept, number, greeting = '') => ({ name, dept, number: `(404) ${number}`, greeting });
export const DIRECTORY = [
  e('Northwind Security Desk', 'Internal · report suspicious calls', '555-0101', 'Northwind Security Desk. Thanks for letting us know; we have logged it.'),
  e('Northwind IT Help Desk', 'Internal', '555-0102'),
  e('Priya Nair, Office Manager', 'Internal', '555-0103', 'Hi, this is Priya. I am away from my desk right now.'),
  e('Accounts Payable, Northwind', 'Internal', '555-0104'),
  e('Warehouse Receiving, Northwind', 'Internal', '555-0105'),
  e('Tallgrass Bank, Business Services', 'Bank · company account', '555-0121'),
  e('Tallgrass Bank, Fraud Prevention', 'Bank · fraud team', '555-0122'),
  e('Keystone Card Services, Corporate Cards', 'Card issuer', '555-0123'),
  e('Meridian Ridge Credit Union', 'Credit union', '555-0124'),
  e('PayLark Payroll', 'Payroll provider', '555-0125'),
  e('Ashby Mutual Insurance, Commercial', 'Insurance', '555-0126'),
  e('Riverton Water & Power, Business Accounts', 'Utility', '555-0141'),
  e('Harlan County Tax Office', 'County government', '555-0142'),
  e('Brightway Parcel, Riverton Depot', 'Delivery', '555-0143'),
  e('Calder Properties, Building Management', 'Building', '555-0144'),
  e('Riverton Fire Marshal\'s Office', 'City government', '555-0145'),
  e('Riverton Business Association', 'Community', '555-0146'),
  e('Clearline Janitorial Products', 'Vendor', '555-0161'),
  e('Summit Paper Co.', 'Vendor', '555-0162'),
  e('Orchard Office Furniture', 'Vendor', '555-0163'),
  e('Bluefin Logistics', 'Vendor', '555-0164')
];
export const number = name => (DIRECTORY.find(d => d.name === name) || {}).number;

// Caller voices (Kokoro), two female and two male, counterbalanced across call types. Confirmed by Ben 2026-10-22.
export const VOICES = { V1: 'af_heart', V2: 'am_michael', V3: 'af_bella', V4: 'am_fenrir' };
