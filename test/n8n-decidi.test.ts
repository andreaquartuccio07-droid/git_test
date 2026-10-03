import { readFileSync } from "node:fs";
import { DateTime, Settings } from "luxon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { interpretazioneVuota, type Interpretazione } from "../src/ai/interpretazione.js";
import { LUNEDI_SERA } from "./aiuti.js";

/**
 * Prova il codice del nodo "Decidi risposta" di n8n (n8n/decidi-risposta.js)
 * simulando quello che n8n gli passa.
 */
const codice = readFileSync("n8n/decidi-risposta.js", "utf8");
const eseguiNodo = new Function("$", "DateTime", codice) as (
  $: (nome: string) => { first: () => { json: unknown } },
  dt: typeof DateTime,
) => [{ json: { risposta: string | null; lead: Record<string, any>; eventi: any[] } }];

const saloneDb = {
  nome: "Autosalone Demo",
  indirizzo: "Via dell'Esempio 1, Livorno",
  fuso_orario: "Europe/Rome",
  orari: {
    "1": [{ da: "09:00", a: "12:30" }, { da: "15:00", a: "19:00" }],
    "2": [{ da: "09:00", a: "12:30" }, { da: "15:00", a: "19:00" }],
    "3": [{ da: "09:00", a: "12:30" }, { da: "15:00", a: "19:00" }],
    "4": [{ da: "09:00", a: "12:30" }, { da: "15:00", a: "19:00" }],
    "5": [{ da: "09:00", a: "12:30" }, { da: "15:00", a: "19:00" }],
    "6": [{ da: "09:00", a: "12:30" }],
  },
  chiusure: [],
  finanziamenti: true,
  documenti_finanziamento: "un documento d'identità, il codice fiscale e l'ultima busta paga",
  ora_sera: 17,
};

/** Una conversazione: ogni risposta del nodo aggiorna il lead come farebbe il nodo "Aggiorna lead". */
class ConversazioneN8n {
  ultimo!: { risposta: string | null; lead: Record<string, any>; eventi: any[] };
  ultimoBot: string | null;
  constructor(public lead: Record<string, any>, inizia = true) {
    this.ultimoBot = inizia ? "Buonasera, sono l'assistente di Autosalone Demo. Mi saprebbe indicare un budget di massima?" : null;
  }
  cliente(testo: string, it: Partial<Interpretazione> = {}) {
    const nodi: Record<string, unknown> = {
      "Carica lead e salone": { ...this.lead, salone: saloneDb, ultimo_bot: this.ultimoBot },
      "Prepara dati": { testo },
      "Capisci messaggio": { output: { ...interpretazioneVuota(), ...it } },
    };
    const [risultato] = eseguiNodo((nome) => ({ first: () => ({ json: nodi[nome] }) }), DateTime);
    this.ultimo = risultato.json;
    this.lead = { ...this.lead, ...risultato.json.lead };
    if (risultato.json.risposta) this.ultimoBot = risultato.json.risposta;
    return risultato.json.risposta;
  }
}

const portale = () => ({
  canale: "Autoscout.it", nome: "Mario", cognome: "Rossi", genere: "M", auto_interesse: "Ford Fiesta",
  budget: null, finanziamento: null, permuta: null, giorno_proposto: null, ora_proposta: null,
  data_appuntamento: null, richiamabile: null, stato: "in_conversazione", risposte_vuote: 0, domande_in_sospeso: [],
});

describe("nodo n8n Decidi risposta", () => {
  beforeAll(() => {
    Settings.now = () => LUNEDI_SERA.toMillis();
  });
  afterAll(() => {
    Settings.now = () => Date.now();
  });

  it("porta un lead da portale fino all'appuntamento", () => {
    const c = new ConversazioneN8n(portale());
    expect(c.cliente("sui 12 mila", { budget: "12000" })).toBe(
      "La ringrazio. Pensa di acquistarla con un finanziamento o in un'unica soluzione?",
    );
    expect(c.cliente("a rate", { finanziamento: "si" })).toBe("Perfetto, grazie. Ha un usato da dare in permuta?");
    expect(c.cliente("no", { permuta: "no" })).toBe("La ringrazio. Quando potrebbe passare in salone?");
    expect(c.cliente("martedì", { giorno: "2026-10-06" })).toBe(
      "Perfetto, grazie. A che ora preferisce passare martedì 6 ottobre?",
    );
    expect(c.cliente("alle 6", { ora: "18:00" })).toBe(
      "Perfetto signor Rossi, la aspettiamo martedì 6 ottobre alle 18:00. Per la verifica del finanziamento porti un documento d'identità, il codice fiscale e l'ultima busta paga. Se le cambia qualcosa mi scriva qui.",
    );
    expect(c.lead).toMatchObject({
      stato: "appuntamento",
      data_appuntamento: "2026-10-06T18:00:00.000+02:00",
      giorno_proposto: null,
      ora_proposta: null,
    });
    expect(c.ultimo.eventi).toEqual([{ tipo: "appuntamento_fissato", quando: "2026-10-06T18:00:00.000+02:00" }]);
  });

  it("chiamata persa: chiede nome e se si può richiamare prima di confermare", () => {
    const c = new ConversazioneN8n({ ...portale(), canale: "chiamata persa", nome: null, cognome: null, genere: null, auto_interesse: null });
    expect(c.cliente("golf, 15000, contanti, niente permuta", {
      auto_cercata: "Volkswagen Golf", budget: "15000", finanziamento: "no", permuta: "no",
    })).toBe("La ringrazio. Quando potrebbe passare in salone?");
    expect(c.cliente("giovedì alle 10", { giorno: "2026-10-08", ora: "10:00" })).toBe(
      "Perfetto, grazie. Per segnare l'appuntamento, mi dice nome e cognome?",
    );
    expect(c.cliente("Laura Bianchi", { nome: "Laura", cognome: "Bianchi", genere: "F" })).toBe(
      "La ringrazio. Se serve, possiamo richiamarla a questo numero?",
    );
    expect(c.cliente("sì", { richiamabile: "si" })).toBe(
      "Perfetto signora Bianchi, la aspettiamo giovedì 8 ottobre alle 10:00. Se le cambia qualcosa mi scriva qui.",
    );
  });

  it("risponde alle domande senza dare prezzi e le gira al venditore", () => {
    const c = new ConversazioneN8n(portale());
    expect(c.cliente("quanto costa? a che ora aprite?", {
      domande: [{ tipo: "prezzo", testo: "quanto costa?" }, { tipo: "orari", testo: "a che ora aprite?" }],
    })).toBe(
      "Sul prezzo le risponde direttamente il venditore, glielo segnalo. Siamo aperti dal lunedì al venerdì dalle 9:00 alle 12:30 e dalle 15:00 alle 19:00, il sabato dalle 9:00 alle 12:30. Mi saprebbe indicare un budget di massima?",
    );
    expect(c.lead.domande_in_sospeso).toEqual(["quanto costa?"]);
  });

  it("controlla giorni di chiusura, orari e propone orari", () => {
    const pronto = { ...portale(), budget: "8000", finanziamento: false, permuta: false };
    expect(new ConversazioneN8n(pronto).cliente("domenica", { giorno: "2026-10-11" })).toBe(
      "Domenica 11 ottobre siamo chiusi. Le andrebbe bene un altro giorno?",
    );
    expect(new ConversazioneN8n(pronto).cliente("sabato alle 16", { giorno: "2026-10-10", ora: "16:00" })).toBe(
      "Sabato 10 ottobre siamo aperti dalle 9:00 alle 12:30. A che ora preferisce passare?",
    );
    const c = new ConversazioneN8n(pronto);
    // Anche se l'AI si inventa un orario, con "stacco alle 17" si propongono due orari.
    expect(c.cliente("mercoledì, stacco alle 17", { giorno: "2026-10-07", libero_dalle: "17:00", ora: "18:00" })).toBe(
      "Allora le propongo alle 17:45 o alle 18:00, cosa preferisce?",
    );
    expect(c.cliente("17:45", { ora: "17:45" })).toBe(
      "Perfetto signor Rossi, la aspettiamo mercoledì 7 ottobre alle 17:45. Se le cambia qualcosa mi scriva qui.",
    );
  });

  it("il giorno scritto dal cliente vale più di quello indicato dall'AI", () => {
    const pronto = { ...portale(), budget: "8000", finanziamento: false, permuta: false };
    // Lunedì 5 ottobre sera: "giovedì" è l'8, anche se l'AI dice martedì 6.
    expect(new ConversazioneN8n(pronto).cliente("posso giovedì alle 10?", { giorno: "2026-10-06", ora: "10:00" })).toBe(
      "Perfetto signor Rossi, la aspettiamo giovedì 8 ottobre alle 10:00. Se le cambia qualcosa mi scriva qui.",
    );
    expect(new ConversazioneN8n(pronto).cliente("giovedì prossimo alle 10", { giorno: "2026-10-08", ora: "10:00" })).toMatch(/giovedì 15 ottobre/);
    expect(new ConversazioneN8n(pronto).cliente("domani alle 10", { giorno: "2026-10-08", ora: "10:00" })).toMatch(/martedì 6 ottobre/);
    // "a domani" come saluto, con l'appuntamento già fissato: non sposta niente.
    const fissato = { ...pronto, data_appuntamento: "2026-10-06T08:00:00.000Z", stato: "appuntamento" };
    expect(new ConversazioneN8n(fissato).cliente("perfetto, a domani!", { intento: "conferma" })).toBe(
      "Grazie a lei, la aspettiamo martedì 6 ottobre alle 10:00.",
    );
    // Due giorni nominati: decide l'AI.
    expect(new ConversazioneN8n(pronto).cliente("non martedì, mercoledì alle 10", { giorno: "2026-10-07", ora: "10:00" })).toMatch(/mercoledì 7 ottobre/);
  });

  it("disdetta e spostamento", () => {
    const fissato = { ...portale(), budget: "8000", finanziamento: false, permuta: false, data_appuntamento: "2026-10-06T16:00:00.000Z", stato: "appuntamento" };
    const c1 = new ConversazioneN8n(fissato);
    expect(c1.cliente("non riesco a venire", { intento: "disdice_o_sposta" })).toBe(
      "Nessun problema, annullo l'appuntamento. Quando potrebbe passare in salone?",
    );
    expect(c1.lead).toMatchObject({ data_appuntamento: null, stato: "in_conversazione" });
    const c2 = new ConversazioneN8n(fissato);
    expect(c2.cliente("posso giovedì invece?", { intento: "disdice_o_sposta", giorno: "2026-10-08" })).toBe(
      "Perfetto signor Rossi, la aspettiamo giovedì 8 ottobre alle 18:00. Se le cambia qualcosa mi scriva qui.",
    );
  });

  it("riformula una volta, poi passa a un venditore", () => {
    const c = new ConversazioneN8n(portale());
    expect(c.cliente("sì")).toBe("Mi scusi, mi saprebbe dire una cifra indicativa, anche a grandi linee?");
    expect(c.cliente("ok")).toBe("Un nostro venditore la richiamerà su questo numero appena possibile. Buona serata.");
    expect(c.lead.stato).toBe("da_richiamare");
  });

  it("STOP chiude e poi il bot tace", () => {
    const c = new ConversazioneN8n(portale());
    expect(c.cliente("STOP")).toBe("Va bene, non la contatteremo più. Buona serata.");
    expect(c.cliente("ciao")).toBeNull();
  });

  it("ricava il genere dal nome se l'AI non lo indica", () => {
    const pronto = { ...portale(), genere: null, budget: "8000", finanziamento: false, permuta: false, giorno_proposto: "2026-10-06" };
    expect(new ConversazioneN8n(pronto).cliente("alle 18", { ora: "18:00" })).toMatch(/^Perfetto signor Rossi,/);
    expect(new ConversazioneN8n({ ...pronto, nome: "Andrea", cognome: "Neri" }).cliente("alle 18", { ora: "18:00" })).toMatch(/^Perfetto signor Neri,/);
    expect(new ConversazioneN8n({ ...pronto, nome: "Giulia", cognome: "Verdi" }).cliente("alle 18", { ora: "18:00" })).toMatch(/^Perfetto signora Verdi,/);
    expect(new ConversazioneN8n({ ...pronto, nome: "Daniele", cognome: "Gialli" }).cliente("alle 18", { ora: "18:00" })).toMatch(/^Perfetto, la aspettiamo/);
  });

  it("se il cliente scrive per primo, il bot si presenta", () => {
    const c = new ConversazioneN8n({ ...portale(), auto_interesse: null, nome: null, cognome: null }, false);
    expect(c.cliente("cerco una Clio", { auto_cercata: "Renault Clio" })).toBe(
      "Buonasera, sono l'assistente di Autosalone Demo. La ringrazio. Mi saprebbe indicare un budget di massima?",
    );
  });
});
