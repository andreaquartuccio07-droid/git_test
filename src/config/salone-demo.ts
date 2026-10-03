import type { Salone } from "../dominio/tipi.js";

const mattinaEPomeriggio = [
  { da: "09:00", a: "12:30" },
  { da: "15:00", a: "19:00" },
];

/** Il salone usato per le demo. Un salone vero avrà la sua riga nel database. */
export const saloneDemo: Salone = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Autosalone Demo",
  citta: "Livorno",
  indirizzo: "Via dell'Esempio 1, Livorno",
  fusoOrario: "Europe/Rome",
  orari: {
    1: mattinaEPomeriggio,
    2: mattinaEPomeriggio,
    3: mattinaEPomeriggio,
    4: mattinaEPomeriggio,
    5: mattinaEPomeriggio,
    6: [{ da: "09:00", a: "12:30" }],
  },
  chiusure: [],
  finanziamenti: true,
  documentiFinanziamento: "un documento d'identità, il codice fiscale e l'ultima busta paga",
  oraSera: 17,
  whatsappPhoneNumberId: process.env.DEMO_WHATSAPP_PHONE_NUMBER_ID ?? null,
};
