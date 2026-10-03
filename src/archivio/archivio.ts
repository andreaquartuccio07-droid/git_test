import type { Evento } from "../motore/motore.js";
import type { Canale, Lead, Messaggio, Salone, TipoMessaggio } from "../dominio/tipi.js";

export interface NuovoLead {
  saloneId: string;
  telefono: string;
  canale: Canale;
  fonte?: string | null;
  nome?: string | null;
  autoInteresse?: string | null;
}

export interface MessaggioArchiviato extends Messaggio {
  id: string;
  tipo: TipoMessaggio;
  /** false finché il bot non ha letto il messaggio del cliente. */
  elaborato: boolean;
}

export interface NuovoMessaggio {
  autore: Messaggio["autore"];
  testo: string;
  tipo?: TipoMessaggio;
  elaborato: boolean;
  /** Id del messaggio presso WhatsApp, per scartare i doppioni. */
  whatsappId?: string | null;
  il?: string;
}

/** Dove vivono saloni, lead, messaggi ed eventi. */
export interface Archivio {
  salone(id: string): Promise<Salone | null>;
  saloneDaNumeroWhatsApp(phoneNumberId: string): Promise<Salone | null>;

  lead(id: string): Promise<Lead | null>;
  /** Il lead in corso (in conversazione o con appuntamento) per quel numero. */
  leadAperto(saloneId: string, telefono: string): Promise<Lead | null>;
  /** Il lead più recente per quel numero, in qualunque stato. */
  ultimoLead(saloneId: string, telefono: string): Promise<Lead | null>;
  creaLead(dati: NuovoLead): Promise<Lead>;
  salvaLead(lead: Lead): Promise<void>;

  /** Restituisce false se il messaggio WhatsApp era già stato salvato. */
  aggiungiMessaggio(lead: Lead, messaggio: NuovoMessaggio): Promise<boolean>;
  /** Gli ultimi messaggi del lead, dal più vecchio al più recente. */
  messaggi(leadId: string, limite: number): Promise<MessaggioArchiviato[]>;
  segnaElaborati(ids: string[]): Promise<void>;

  registraEventi(lead: Lead, eventi: Evento[]): Promise<void>;
}

/** I campi di un lead appena creato. */
export function leadIniziale(id: string, dati: NuovoLead, creatoIl: string): Lead {
  return {
    id,
    saloneId: dati.saloneId,
    telefono: dati.telefono,
    canale: dati.canale,
    fonte: dati.fonte ?? null,
    nome: dati.nome ?? null,
    cognome: null,
    genere: null,
    autoInteresse: dati.autoInteresse ?? null,
    budget: null,
    finanziamento: null,
    permuta: null,
    usato: null,
    giornoProposto: null,
    oraProposta: null,
    appuntamento: null,
    richiamabile: null,
    stato: "in_conversazione",
    risposteVuote: 0,
    domandeInSospeso: [],
    creatoIl,
    ultimoMessaggioIl: null,
  };
}
