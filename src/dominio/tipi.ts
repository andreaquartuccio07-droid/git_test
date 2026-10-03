/** Fascia oraria di apertura, es. { da: "09:00", a: "12:30" }. */
export interface Fascia {
  da: string;
  a: string;
}

/**
 * Orari di apertura per giorno della settimana (1 = lunedì ... 7 = domenica,
 * come in Luxon). Un giorno assente o vuoto è un giorno di chiusura.
 */
export type OrariSettimana = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Fascia[]>>;

/** Tutto ciò che cambia da un salone all'altro. Niente di questo va scritto nel codice. */
export interface Salone {
  id: string;
  nome: string;
  citta: string;
  indirizzo: string;
  fusoOrario: string;
  orari: OrariSettimana;
  /** Giorni di chiusura straordinaria (ferie, festivi) in formato AAAA-MM-GG. */
  chiusure: string[];
  finanziamenti: boolean;
  /** Documenti da portare per la verifica del finanziamento. */
  documentiFinanziamento: string;
  /** Ora (0-23) da cui si passa da "Buongiorno" a "Buonasera". */
  oraSera: number;
  /** Identificativo del numero WhatsApp del salone presso Meta. */
  whatsappPhoneNumberId: string | null;
}

export type Canale = "portale" | "sito" | "chiamata_persa" | "whatsapp";

export type StatoLead =
  /** Il bot sta raccogliendo i dati. */
  | "in_conversazione"
  /** Appuntamento fissato. */
  | "appuntamento"
  /** Il cliente va richiamato da una persona: il bot non scrive più. */
  | "da_richiamare"
  /** Un venditore ha preso in mano la chat: il bot non scrive più. */
  | "gestito_da_venditore"
  /** Il cliente non è interessato o ha chiesto di non essere contattato. */
  | "chiuso";

export type Genere = "M" | "F";

export interface Lead {
  id: string;
  saloneId: string;
  telefono: string;
  canale: Canale;
  /** Portale di provenienza, es. "AutoScout24". */
  fonte: string | null;
  nome: string | null;
  cognome: string | null;
  genere: Genere | null;
  autoInteresse: string | null;
  /** Budget come detto dal cliente, es. "15000" o "anticipo 5000". */
  budget: string | null;
  finanziamento: boolean | null;
  permuta: boolean | null;
  /** Descrizione dell'usato da dare in permuta, se il cliente l'ha detta. */
  usato: string | null;
  /** Giorno scelto dal cliente (AAAA-MM-GG), in attesa dell'ora. */
  giornoProposto: string | null;
  /** Ora scelta dal cliente (HH:mm), in attesa del giorno o dei dati per confermare. */
  oraProposta: string | null;
  /** Appuntamento confermato, ISO con fuso orario. */
  appuntamento: string | null;
  richiamabile: boolean | null;
  stato: StatoLead;
  /** Risposte consecutive che non hanno dato il dato richiesto. */
  risposteVuote: number;
  /** Domande del cliente a cui il bot non sa rispondere: le vede il venditore. */
  domandeInSospeso: string[];
  creatoIl: string;
  ultimoMessaggioIl: string | null;
}

export interface Messaggio {
  autore: "cliente" | "bot" | "venditore";
  testo: string;
  il: string;
}

/** Tipo di messaggio WhatsApp: il bot legge solo il testo. */
export type TipoMessaggio = "testo" | "vocale" | "immagine" | "altro";
