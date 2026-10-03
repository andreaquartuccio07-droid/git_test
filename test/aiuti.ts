import { DateTime } from "luxon";
import {
  interpretazioneVuota,
  type ContestoInterpretazione,
  type Interpretazione,
  type Interprete,
} from "../src/ai/interpretazione.js";
import { saloneDemo } from "../src/config/salone-demo.js";
import type { Lead, Messaggio } from "../src/dominio/tipi.js";
import { gestisciMessaggio, type Esito } from "../src/motore/motore.js";

/** Lunedì 5 ottobre 2026 alle 20:30: il salone è chiuso, il bot lavora. */
export const LUNEDI_SERA = DateTime.fromISO("2026-10-05T20:30", { zone: "Europe/Rome" });

export function nuovoLead(dati: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    saloneId: saloneDemo.id,
    telefono: "+393331234567",
    canale: "portale",
    fonte: "AutoScout24",
    nome: null,
    cognome: null,
    genere: null,
    autoInteresse: null,
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
    creatoIl: LUNEDI_SERA.toISO()!,
    ultimoMessaggioIl: null,
    ...dati,
  };
}

/** Un interprete finto: per ogni messaggio del cliente restituisce l'interpretazione scritta nel test. */
export class InterpreteFinto implements Interprete {
  chiamate: ContestoInterpretazione[] = [];
  constructor(private readonly risposte: Record<string, Partial<Interpretazione>> = {}) {}

  async interpreta(c: ContestoInterpretazione): Promise<Interpretazione> {
    this.chiamate.push(c);
    const r = this.risposte[c.testo];
    if (!r) throw new Error(`Il test non prevede il messaggio: "${c.testo}"`);
    return { ...interpretazioneVuota(), ...r };
  }
}

/** Fa girare una conversazione intera e restituisce le risposte del bot. */
export class Conversazione {
  storico: Messaggio[] = [];
  ultimo!: Esito;
  constructor(
    public lead: Lead,
    private readonly interprete: Interprete,
    private readonly adesso = LUNEDI_SERA,
  ) {}

  async cliente(testo: string): Promise<string | null> {
    this.ultimo = await gestisciMessaggio(
      { salone: saloneDemo, lead: this.lead, storico: this.storico, testo, adesso: this.adesso },
      this.interprete,
    );
    this.storico.push({ autore: "cliente", testo, il: this.adesso.toISO()! });
    if (this.ultimo.risposta) {
      this.storico.push({ autore: "bot", testo: this.ultimo.risposta, il: this.adesso.toISO()! });
    }
    this.lead = this.ultimo.lead;
    return this.ultimo.risposta;
  }
}
