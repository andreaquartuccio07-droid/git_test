import { DateTime } from "luxon";
import type { Interpretazione, Interprete } from "../ai/interpretazione.js";
import {
  calendario,
  fasceDelGiorno,
  istante,
  proponiOrari,
  verificaOrario,
  type GiornoCalendario,
} from "../dominio/calendario.js";
import type { Lead, Messaggio, Salone } from "../dominio/tipi.js";
import {
  DOMANDE_PER_IL_VENDITORE,
  conferma,
  domanda,
  domandaRiformulata,
  frasi,
  ringraziamento,
  rispostaADomanda,
  type Dato,
} from "./frasi.js";
import { primoContatto, type MessaggioTemplate } from "./primo-contatto.js";

/** Cose successe nella conversazione che il venditore deve sapere. */
export type Evento =
  | { tipo: "appuntamento_fissato"; quando: string }
  | { tipo: "appuntamento_annullato" }
  | { tipo: "da_richiamare"; motivo: string }
  | { tipo: "non_interessato" }
  | { tipo: "domanda_per_venditore"; testo: string }
  | { tipo: "messaggio_senza_risposta"; motivo: string }
  | { tipo: "nuova_richiesta"; canale: string; fonte: string | null; auto: string | null }
  | { tipo: "invio_fallito"; errore: string };

export interface Esito {
  /** Il messaggio da mandare al cliente, oppure null se il bot deve restare zitto. */
  risposta: string | null;
  lead: Lead;
  eventi: Evento[];
}

export interface Ingresso {
  salone: Salone;
  lead: Lead;
  storico: Messaggio[];
  testo: string;
  adesso: DateTime;
}

/** Parole che fermano il bot senza nemmeno chiedere all'AI. */
const STOP = /^\s*(stop|basta|cancellami|cancellatemi|non scrivetemi più)\s*[.!]*\s*$/i;

/** Dopo quante risposte di fila senza il dato richiesto si passa a una persona. */
const MAX_RISPOSTE_VUOTE = 2;

/** Il primo dato che manca, nell'ordine in cui va chiesto. null = tutto raccolto. */
export function prossimoDato(lead: Lead, salone: Salone): Dato | null {
  if (lead.appuntamento) return null;
  if (!lead.autoInteresse) return "auto";
  if (!lead.budget) return "budget";
  if (salone.finanziamenti && lead.finanziamento === null) return "pagamento";
  if (lead.permuta === null) return "permuta";
  if (!lead.giornoProposto) return "giorno";
  if (!lead.oraProposta) return "ora";
  if (!lead.nome && !lead.cognome) return "nome";
  if (lead.canale === "chiamata_persa" && lead.richiamabile === null) return "richiamabile";
  return null;
}

/** Il primo messaggio al cliente appena arriva il lead: è sempre un template WhatsApp. */
export function avviaConversazione(lead: Lead, salone: Salone, adesso: DateTime): MessaggioTemplate {
  return primoContatto(lead, salone, adesso);
}

export async function gestisciMessaggio(ingresso: Ingresso, interprete: Interprete): Promise<Esito> {
  const { salone, storico, testo, adesso } = ingresso;
  const lead: Lead = {
    ...ingresso.lead,
    domandeInSospeso: [...ingresso.lead.domandeInSospeso],
    ultimoMessaggioIl: adesso.toISO(),
  };
  const eventi: Evento[] = [];
  // Se è il cliente a scrivere per primo, il bot si presenta.
  const presentati = !storico.some((m) => m.autore === "bot");
  const esito = (risposta: string | null): Esito => ({
    risposta: risposta && presentati ? `${frasi.presentazione(salone, adesso)} ${risposta}` : risposta,
    lead,
    eventi,
  });

  // Se la chat è passata a una persona, o il cliente ha chiesto di non essere
  // contattato, il bot non risponde: il messaggio lo vede il venditore.
  if (lead.stato === "gestito_da_venditore" || lead.stato === "da_richiamare" || lead.stato === "chiuso") {
    eventi.push({ tipo: "messaggio_senza_risposta", motivo: lead.stato });
    return esito(null);
  }

  if (STOP.test(testo)) return chiudi(lead, salone, adesso, eventi);

  const cal = calendario(salone, adesso);
  const it = await interprete.interpreta({ salone, lead, storico, testo, adesso, calendario: cal });

  switch (it.intento) {
    case "non_interessato":
      return chiudi(lead, salone, adesso, eventi);
    case "vuole_una_persona":
      return daRichiamare(lead, eventi, "il cliente vuole parlare con una persona", frasi.vuoleUnaPersona);
    case "altro_motivo":
      lead.domandeInSospeso.push(testo);
      return daRichiamare(lead, eventi, `contatto per un altro motivo: "${testo}"`, frasi.altroMotivo);
  }

  const parti: string[] = [];

  // 1. Prima si risponde alle domande del cliente.
  const tipiVisti = new Set<string>();
  for (const d of it.domande) {
    if (tipiVisti.has(d.tipo)) continue;
    tipiVisti.add(d.tipo);
    parti.push(rispostaADomanda(d.tipo, salone));
    if (DOMANDE_PER_IL_VENDITORE.includes(d.tipo)) {
      lead.domandeInSospeso.push(d.testo);
      eventi.push({ tipo: "domanda_per_venditore", testo: d.testo });
    }
  }

  // 2. Disdetta o spostamento.
  // Se nello stesso messaggio propone già un nuovo giorno o una nuova ora, è uno
  // spostamento: lo gestisce gestisciGiornoEOra tenendo quello che non cambia.
  let annullato = false;
  const proponeAltro = Boolean(it.giorno || it.ora || it.libero_dalle);
  if (
    it.intento === "disdice_o_sposta" &&
    !proponeAltro &&
    (lead.appuntamento || lead.giornoProposto || lead.oraProposta)
  ) {
    if (lead.appuntamento) eventi.push({ tipo: "appuntamento_annullato" });
    lead.appuntamento = null;
    lead.giornoProposto = null;
    lead.oraProposta = null;
    lead.stato = "in_conversazione";
    annullato = true;
  }

  // 3. I dati detti dal cliente. Vale sempre l'ultima cosa detta.
  let nuoviDati = applicaDati(lead, it);

  // 4. Giorno e ora: li controlla il codice, non l'AI.
  const giornoEOraPrima = `${lead.giornoProposto}|${lead.oraProposta}|${lead.appuntamento}`;
  const problema = gestisciGiornoEOra(lead, it, salone, adesso, cal, eventi);
  if (`${lead.giornoProposto}|${lead.oraProposta}|${lead.appuntamento}` !== giornoEOraPrima) nuoviDati = true;

  if (annullato && !problema && !lead.giornoProposto) {
    parti.push(frasi.annullato);
  }

  if (problema) {
    lead.risposteVuote = 0;
    parti.push(problema);
    return esito(parti.join(" "));
  }

  const dato = prossimoDato(lead, salone);

  // 5a. Appuntamento già fissato: si risponde e basta.
  if (dato === null && lead.appuntamento) {
    if (it.intento === "ambiguo") {
      const [data, ora] = dataEOra(lead.appuntamento, salone);
      parti.push(frasi.chiediConferma(salone, data, ora));
    } else if (nuoviDati) {
      parti.push("La ringrazio, lo riferisco al venditore.");
    } else if (parti.length === 0) {
      const [data, ora] = dataEOra(lead.appuntamento, salone);
      parti.push(frasi.aspettiamo(salone, data, ora));
    }
    return esito(parti.join(" "));
  }

  // 5b. Abbiamo tutto: si conferma l'appuntamento.
  if (dato === null) {
    const data = lead.giornoProposto!;
    const ora = lead.oraProposta!;
    lead.appuntamento = istante(salone, data, ora);
    lead.giornoProposto = null;
    lead.oraProposta = null;
    lead.stato = "appuntamento";
    lead.risposteVuote = 0;
    eventi.push({ tipo: "appuntamento_fissato", quando: lead.appuntamento });
    parti.push(conferma(lead, salone, data, ora));
    return esito(parti.join(" "));
  }

  // 5c. Manca ancora qualcosa: si chiede il primo dato che manca.
  const progresso = nuoviDati || it.domande.length > 0 || annullato;
  if (progresso) {
    lead.risposteVuote = 0;
    if (nuoviDati && it.domande.length === 0 && !annullato) {
      parti.push(ringraziamento(ultimoMessaggioBot(storico)));
    }
    parti.push(domanda(dato, lead, salone));
    return esito(parti.join(" "));
  }

  lead.risposteVuote += 1;
  if (lead.risposteVuote >= MAX_RISPOSTE_VUOTE) {
    lead.stato = "da_richiamare";
    eventi.push({ tipo: "da_richiamare", motivo: "il cliente non ha dato risposte utili" });
    return esito(frasi.richiamo(salone, adesso));
  }
  if (it.intento === "fuori_tema") {
    parti.push(frasi.fuoriTema, domanda(dato, lead, salone));
  } else {
    parti.push(domandaRiformulata(dato, lead, salone));
  }
  return esito(parti.join(" "));
}

function chiudi(lead: Lead, salone: Salone, adesso: DateTime, eventi: Evento[]): Esito {
  if (lead.appuntamento) eventi.push({ tipo: "appuntamento_annullato" });
  lead.stato = "chiuso";
  lead.appuntamento = null;
  eventi.push({ tipo: "non_interessato" });
  return { risposta: frasi.stop(salone, adesso), lead, eventi };
}

function daRichiamare(lead: Lead, eventi: Evento[], motivo: string, risposta: string): Esito {
  lead.stato = "da_richiamare";
  eventi.push({ tipo: "da_richiamare", motivo });
  return { risposta, lead, eventi };
}

/** Copia nel lead i dati detti dal cliente. Restituisce true se è cambiato qualcosa. */
function applicaDati(lead: Lead, it: Interpretazione): boolean {
  const prima = JSON.stringify(lead);
  const siNo = (v: "si" | "no" | null, attuale: boolean | null) =>
    v === null ? attuale : v === "si";

  if (it.auto_cercata) lead.autoInteresse = it.auto_cercata;
  if (it.budget) lead.budget = it.budget;
  lead.finanziamento = siNo(it.finanziamento, lead.finanziamento);
  lead.permuta = siNo(it.permuta, lead.permuta);
  if (it.usato) {
    lead.usato = it.usato;
    lead.permuta = true;
  }
  if (it.nome) lead.nome = it.nome;
  if (it.cognome) lead.cognome = it.cognome;
  if (it.genere) lead.genere = it.genere;
  lead.richiamabile = siNo(it.richiamabile, lead.richiamabile);
  return JSON.stringify(lead) !== prima;
}

/**
 * Aggiorna giorno e ora proposti dal cliente e li verifica contro gli orari
 * del salone. Restituisce il messaggio da mandare se c'è un problema.
 */
function gestisciGiornoEOra(
  lead: Lead,
  it: Interpretazione,
  salone: Salone,
  adesso: DateTime,
  cal: GiornoCalendario[],
  eventi: Evento[],
): string | null {
  if (!it.giorno && !it.ora && !it.libero_dalle) return null;

  // Il cliente propone un nuovo giorno o una nuova ora con l'appuntamento già fissato: è uno spostamento.
  if (lead.appuntamento && (it.giorno || it.ora)) {
    const [data, ora] = dataEOra(lead.appuntamento, salone);
    lead.giornoProposto = data;
    lead.oraProposta = ora;
    lead.appuntamento = null;
    lead.stato = "in_conversazione";
    eventi.push({ tipo: "appuntamento_annullato" });
  }

  if (it.giorno) {
    const g = cal.find((x) => x.data === it.giorno);
    if (!g) return frasi.fuoriCalendario(cal[cal.length - 1]!.etichetta);
    if (!g.aperto) {
      lead.giornoProposto = null;
      return frasi.giornoChiuso(salone, g.data);
    }
    lead.giornoProposto = g.data;
  }
  if (it.ora) lead.oraProposta = it.ora;

  if (lead.giornoProposto && lead.oraProposta) {
    const v = verificaOrario(salone, lead.giornoProposto, lead.oraProposta, adesso);
    if (!v.valido) {
      lead.oraProposta = null;
      if (v.motivo === "troppo_presto") return frasi.troppoPresto;
      return frasi.fuoriOrario(salone, lead.giornoProposto, fasceDelGiorno(lead.giornoProposto, salone));
    }
  }

  if (it.libero_dalle && lead.giornoProposto && !lead.oraProposta) {
    const proposte = proponiOrari(salone, lead.giornoProposto, it.libero_dalle, adesso);
    if (proposte.length === 0) {
      const giorno = lead.giornoProposto;
      lead.giornoProposto = null;
      return frasi.nessunOrario(salone, giorno);
    }
    return frasi.proposta(proposte);
  }
  return null;
}

function dataEOra(iso: string, salone: Salone): [string, string] {
  const d = DateTime.fromISO(iso, { zone: salone.fusoOrario });
  return [d.toISODate()!, d.toFormat("HH:mm")];
}

function ultimoMessaggioBot(storico: Messaggio[]): string | null {
  for (let i = storico.length - 1; i >= 0; i--) {
    if (storico[i]!.autore === "bot") return storico[i]!.testo;
  }
  return null;
}
