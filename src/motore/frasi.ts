import type { DateTime } from "luxon";
import {
  congedo,
  descriviOrari,
  etichettaData,
  fasceDelGiorno,
  oraLeggibile,
  saluto,
} from "../dominio/calendario.js";
import type { Fascia, Lead, Salone } from "../dominio/tipi.js";
import type { TipoDomanda } from "../ai/interpretazione.js";

/**
 * Tutte le frasi che il bot può scrivere. Stanno qui, scritte a mano, così il
 * bot non inventa mai niente e il salone sa sempre cosa riceverà il cliente.
 */

export type Dato =
  | "auto"
  | "budget"
  | "pagamento"
  | "permuta"
  | "giorno"
  | "ora"
  | "nome"
  | "richiamabile";

export function domanda(dato: Dato, lead: Lead, salone: Salone): string {
  switch (dato) {
    case "auto":
      return "Mi dice per quale auto ci aveva cercato?";
    case "budget":
      return "Mi saprebbe indicare un budget di massima?";
    case "pagamento":
      return "Pensa di acquistarla con un finanziamento o in un'unica soluzione?";
    case "permuta":
      return "Ha un usato da dare in permuta?";
    case "giorno":
      return "Quando potrebbe passare in salone?";
    case "ora":
      return `A che ora preferisce passare ${etichettaData(lead.giornoProposto!, salone)}?`;
    case "nome":
      return "Per segnare l'appuntamento, mi dice nome e cognome?";
    case "richiamabile":
      return "Se serve, possiamo richiamarla a questo numero?";
  }
}

/** La stessa domanda in forma più semplice, quando il cliente non ha dato il dato. */
export function domandaRiformulata(dato: Dato, lead: Lead, salone: Salone): string {
  switch (dato) {
    case "auto":
      return "Mi scusi, sta cercando un'auto in particolare?";
    case "budget":
      return "Mi scusi, mi saprebbe dire una cifra indicativa, anche a grandi linee?";
    case "pagamento":
      return "Mi scusi, intende con un finanziamento?";
    case "permuta":
      return "Mi scusi, ha un'auto sua da dare in permuta?";
    case "giorno":
      return "Mi scusi, mi dice un giorno in cui potrebbe passare?";
    case "ora": {
      const fasce = fasceDelGiorno(lead.giornoProposto!, salone);
      return `Mi scusi, mi indica un orario? ${maiuscola(etichettaData(lead.giornoProposto!, salone))} siamo aperti ${descriviOrari(fasce)}.`;
    }
    case "nome":
      return "Mi scusi, mi dice il suo nome e cognome per l'appuntamento?";
    case "richiamabile":
      return "Mi scusi, se serve possiamo richiamarla a questo numero?";
  }
}

export function rispostaADomanda(tipo: TipoDomanda, salone: Salone): string {
  switch (tipo) {
    case "prezzo":
      return "Sul prezzo le risponde direttamente il venditore, glielo segnalo.";
    case "valutazione_usato":
      return "L'usato lo valuta il venditore di persona qui in salone, dopo averlo visto.";
    case "finanziamento":
      return salone.finanziamenti
        ? "Sì, facciamo finanziamenti: l'approvazione la dà la finanziaria dopo una verifica che il venditore fa in salone."
        : "Non facciamo finanziamenti, il pagamento è in un'unica soluzione.";
    case "disponibilita_auto":
      return "Verifico con il venditore che sia ancora disponibile e le faccio sapere.";
    case "orari":
      return `Siamo aperti ${descriviSettimana(salone)}.`;
    case "indirizzo":
      return `Ci trova in ${salone.indirizzo}.`;
    case "altro":
      return "Verifico con il venditore e le faccio sapere.";
  }
}

/** Le domande a cui il bot non sa rispondere: vanno girate al venditore. */
export const DOMANDE_PER_IL_VENDITORE: TipoDomanda[] = ["prezzo", "disponibilita_auto", "altro"];

const RINGRAZIAMENTI = ["La ringrazio.", "Perfetto, grazie.", "Bene, grazie."];

/** Un ringraziamento che non inizi con la stessa parola del messaggio precedente del bot. */
export function ringraziamento(ultimoMessaggioBot: string | null): string {
  const primaParola = (s: string) => s.trim().split(/[\s,.]+/)[0]?.toLowerCase();
  const precedente = ultimoMessaggioBot ? primaParola(ultimoMessaggioBot) : null;
  return RINGRAZIAMENTI.find((r) => primaParola(r) !== precedente) ?? RINGRAZIAMENTI[0]!;
}

/** "signor Rossi", "signora Bianchi", oppure null se non sappiamo cognome o genere. */
export function titolo(lead: Lead): string | null {
  if (!lead.cognome || !lead.genere) return null;
  return `${lead.genere === "F" ? "signora" : "signor"} ${lead.cognome}`;
}

export function conferma(lead: Lead, salone: Salone, data: string, ora: string): string {
  const t = titolo(lead);
  const parti = [
    `Perfetto${t ? ` ${t}` : ""}, la aspettiamo ${etichettaData(data, salone)} alle ${oraLeggibile(ora)}.`,
  ];
  if (lead.finanziamento === true && salone.finanziamenti) {
    parti.push(`Per la verifica del finanziamento porti ${salone.documentiFinanziamento}.`);
  }
  parti.push("Se le cambia qualcosa mi scriva qui.");
  return parti.join(" ");
}

export function primoMessaggio(
  lead: Lead,
  salone: Salone,
  adesso: DateTime,
  primaDomanda: Dato,
): string {
  const t = titolo(lead);
  const apertura = `${saluto(salone, adesso)}${t ? ` ${t}` : ""}, sono l'assistente di ${salone.nome}.`;
  if (lead.canale === "chiamata_persa") {
    return `${apertura} Ha chiamato poco fa e non siamo riusciti a risponderle. ${domanda("auto", lead, salone)}`;
  }
  const ringrazia = lead.autoInteresse
    ? `La ringrazio per la richiesta sulla ${lead.autoInteresse}.`
    : "La ringrazio per la sua richiesta.";
  return `${apertura} ${ringrazia} ${domanda(primaDomanda, lead, salone)}`;
}

export const frasi = {
  stop: (salone: Salone, adesso: DateTime) =>
    `Va bene, non la contatteremo più. ${congedo(salone, adesso)}.`,
  richiamo: (salone: Salone, adesso: DateTime) =>
    `Un nostro venditore la richiamerà su questo numero appena possibile. ${congedo(salone, adesso)}.`,
  vuoleUnaPersona: "Mi scusi, le faccio richiamare da un nostro venditore appena possibile.",
  altroMotivo:
    "La ringrazio, lo segnalo a un nostro collega che la ricontatterà appena possibile.",
  fuoriTema: "Su questo purtroppo non posso aiutarla, mi occupo degli appuntamenti in salone.",
  annullato: "Nessun problema, annullo l'appuntamento.",
  chiediConferma: (salone: Salone, data: string, ora: string) =>
    `Mi conferma se l'appuntamento di ${etichettaData(data, salone)} alle ${oraLeggibile(ora)} resta valido?`,
  aspettiamo: (salone: Salone, data: string, ora: string) =>
    `Grazie a lei, la aspettiamo ${etichettaData(data, salone)} alle ${oraLeggibile(ora)}.`,
  giornoChiuso: (salone: Salone, data: string) =>
    `${maiuscola(etichettaData(data, salone))} siamo chiusi. Le andrebbe bene un altro giorno?`,
  fuoriCalendario: (ultimoGiorno: string) =>
    `Per ora fissiamo appuntamenti fino a ${ultimoGiorno}. Quale giorno le andrebbe bene?`,
  fuoriOrario: (salone: Salone, data: string, fasce: Fascia[]) =>
    `${maiuscola(etichettaData(data, salone))} siamo aperti ${descriviOrari(fasce)}. A che ora preferisce passare?`,
  troppoPresto: "Per oggi ci serve almeno un'ora di preavviso. A che ora preferisce passare?",
  proposta: (orari: string[]) =>
    orari.length === 1
      ? `Le andrebbe bene alle ${oraLeggibile(orari[0]!)}?`
      : `Allora le propongo alle ${oraLeggibile(orari[0]!)} o alle ${oraLeggibile(orari[1]!)}, cosa preferisce?`,
  nessunOrario: (salone: Salone, data: string) =>
    `${maiuscola(etichettaData(data, salone))} a quell'ora siamo già chiusi. Le andrebbe bene un altro giorno?`,
};

const NOMI_GIORNI = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** "dal lunedì al venerdì dalle 9:00 alle 12:30 e dalle 15:00 alle 19:00, il sabato dalle 9:00 alle 12:30" */
export function descriviSettimana(salone: Salone): string {
  const chiave = (f: Fascia[] | undefined) => JSON.stringify(f ?? []);
  const gruppi: { da: number; a: number; fasce: Fascia[] }[] = [];
  for (let g = 1; g <= 7; g++) {
    const fasce = salone.orari[g as 1] ?? [];
    if (fasce.length === 0) continue;
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.a === g - 1 && chiave(ultimo.fasce) === chiave(fasce)) ultimo.a = g;
    else gruppi.push({ da: g, a: g, fasce });
  }
  return gruppi
    .map((x) => {
      const giorni =
        x.da === x.a ? `il ${NOMI_GIORNI[x.da]}` : `dal ${NOMI_GIORNI[x.da]} al ${NOMI_GIORNI[x.a]}`;
      return `${giorni} ${descriviOrari(x.fasce)}`;
    })
    .join(", ");
}

export function maiuscola(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
