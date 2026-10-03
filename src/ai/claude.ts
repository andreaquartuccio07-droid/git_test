import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  SchemaInterpretazione,
  type ContestoInterpretazione,
  type Interpretazione,
  type Interprete,
} from "./interpretazione.js";

const MODELLO_PREDEFINITO = "claude-opus-5-5";

/**
 * Istruzioni fisse: non contengono date né dati del cliente, così restano
 * identiche tra una richiesta e l'altra.
 */
const ISTRUZIONI = `Lavori per un autosalone di auto usate. Un assistente su WhatsApp sta parlando con un cliente per fissare un appuntamento in salone.
Il tuo compito è solo CAPIRE l'ultimo messaggio del cliente e restituire i dati strutturati. Non scrivi risposte al cliente: le scrive il programma.

REGOLE GENERALI
- Ricava i dati solo da ciò che ha scritto il cliente. I messaggi dell'assistente ti servono solo per capire a quale domanda sta rispondendo.
- Riporta solo dati NUOVI o CAMBIATI in questo ultimo messaggio. Tutto il resto è null.
- Se il cliente cambia idea, vale l'ultima cosa detta.
- Un semplice "sì", "no" o "ok" dà un dato solo se l'ultima domanda dell'assistente era da sì/no su quel dato (es. "Ha un usato da dare in permuta?" → "sì" = permuta "si"). Se la domanda chiedeva una cifra, una scelta tra due cose o un giorno, "sì"/"ok" non dà nessun dato.
- Non inventare mai niente. Nel dubbio, null.

CAMPI
- auto_cercata: l'auto che il cliente dice di cercare, con la marca davanti al modello se la riconosci con certezza e le maiuscole giuste ("fiesta 2024" → "Ford Fiesta del 2024", "panda" → "Fiat Panda").
- budget: cifra in euro, solo il numero ("15 mila" → "15000", "tra 10 e 12 mila" → "10000-12000"). Se il cliente dice una cifra da dare subito e il resto a rate, quella non è il budget: scrivi "anticipo " seguito dalla cifra (es. "anticipo 5000").
- finanziamento: "si" se vuole pagare a rate o con un finanziamento (anche "accettate finanziamenti?" vale "si"), "no" se paga in contanti, con bonifico o in un'unica soluzione.
- permuta: "si" se ha un'auto sua da dare in permuta, anche detto in modo indiretto ("ho una Panda da dare dentro", "quanto mi date per la mia Punto"); "no" solo se dice chiaramente che non ha niente da dare.
- usato: l'auto che vuole dare in permuta, se la descrive (es. "Fiat Punto del 2012").
- giorno: data AAAA-MM-GG presa SOLO dal CALENDARIO che ti viene dato, mai calcolata. "oggi" e "domani" sono le righe indicate. Un giorno della settimana senza altro (es. "martedì") è la prima riga con quel nome dopo oggi. Se il cliente dice che intende la settimana dopo ("martedì prossimo", "non questo, l'altro") è la seconda. Se la data che intende non è nel calendario, scrivila comunque in formato AAAA-MM-GG.
- ora: l'orario preciso scelto dal cliente, formato HH:mm a 24 ore. "alle 6" o "alle 5 e mezza" senza altro sono del pomeriggio (18:00, 17:30). "verso le 10" = 10:00.
- libero_dalle: se il cliente non dà un orario preciso ma dice da quando è libero ("stacco alle 17", "dopo il lavoro, finisco alle 18"), quell'ora in formato HH:mm. In quel caso "ora" deve restare null: l'orario lo sceglierà il cliente. Altrimenti null.
- nome e cognome: come li ha scritti il cliente su di sé. Se nei DATI GIÀ NOTI c'è un nome completo ma manca il cognome, ricava nome e cognome da lì.
- genere: "M" o "F" dal nome di battesimo, solo se è chiaro secondo l'uso italiano (Andrea, Luca, Nicola sono maschili). Se il genere è già noto o non è chiaro, null.
- richiamabile: "si" se il cliente accetta di essere richiamato a questo numero, "no" se dice di non richiamarlo.
- domande: ogni domanda che il cliente fa all'assistente, con il tipo:
  prezzo (prezzo, sconti, trattativa), valutazione_usato (quanto vale la sua auto), finanziamento (se fate finanziamenti, rate, tassi), disponibilita_auto (se l'auto c'è ancora, chilometri, optional, caratteristiche dell'auto), orari (quando siete aperti), indirizzo (dove siete), altro (tutto il resto).
  Una frase che dà solo un dato non è una domanda.

INTENTO (uno solo)
- normale: risponde, dà informazioni o fa domande pertinenti.
- conferma: conferma che l'appuntamento già fissato resta valido.
- disdice_o_sposta: vuole annullare o spostare l'appuntamento.
- non_interessato: non vuole più comprare, ha già comprato altrove o chiede di non essere più contattato. Disdire o spostare un appuntamento NON conta.
- altro_motivo: contatta il salone per altro rispetto all'acquisto di un'auto (una pratica, un'auto già comprata, un fornitore, un errore).
- fuori_tema: scrive cose che non c'entrano con l'auto né con l'appuntamento.
- vuole_una_persona: chiede di parlare con una persona o un venditore, oppure è arrabbiato o insiste.
- ambiguo: non è chiaro se conferma, disdice o rinuncia ("ci ho ripensato", "vediamo", "non so").`;

function descriviLead(c: ContestoInterpretazione): string {
  const l = c.lead;
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "non noto" : String(x));
  const sn = (x: boolean | null) => (x === null ? "non noto" : x ? "sì" : "no");
  return [
    `Nome: ${v([l.nome, l.cognome].filter(Boolean).join(" "))}`,
    `Cognome: ${v(l.cognome)}`,
    `Genere: ${v(l.genere)}`,
    `Auto di interesse: ${v(l.autoInteresse)}`,
    `Budget: ${v(l.budget)}`,
    `Finanziamento: ${sn(l.finanziamento)}`,
    `Permuta: ${sn(l.permuta)}`,
    `Giorno proposto: ${v(l.giornoProposto)}`,
    `Ora proposta: ${v(l.oraProposta)}`,
    `Appuntamento fissato: ${v(l.appuntamento)}`,
    `Arrivato da: ${l.canale === "chiamata_persa" ? "una chiamata persa" : v(l.fonte ?? l.canale)}`,
  ].join("\n");
}

function componiRichiesta(c: ContestoInterpretazione): string {
  const calendario = c.calendario
    .map((g) => {
      const note = [g.oggi ? "oggi" : null, g.data === c.calendario[1]?.data ? "domani" : null, g.aperto ? null : "chiuso"]
        .filter(Boolean)
        .join(", ");
      return `${g.etichetta} → ${g.data}${note ? ` (${note})` : ""}`;
    })
    .join("\n");
  const conversazione = c.storico
    .map((m) => `${m.autore === "cliente" ? "CLIENTE" : "ASSISTENTE"}: ${m.testo}`)
    .join("\n");
  const adesso = c.adesso.setZone(c.salone.fusoOrario).setLocale("it");

  return `Adesso: ${adesso.toFormat("cccc d LLLL yyyy, HH:mm")}

CALENDARIO
${calendario}

DATI GIÀ NOTI DEL CLIENTE
${descriviLead(c)}

CONVERSAZIONE FINO A ORA
${conversazione || "(nessun messaggio)"}

ULTIMO MESSAGGIO DEL CLIENTE, DA INTERPRETARE
${c.testo}`;
}

export class InterpreteClaude implements Interprete {
  constructor(
    private readonly client = new Anthropic(),
    private readonly modello = process.env.LLM_MODEL || MODELLO_PREDEFINITO,
  ) {}

  async interpreta(contesto: ContestoInterpretazione): Promise<Interpretazione> {
    const risposta = await this.client.beta.messages.parse({
      model: this.modello,
      max_tokens: 4000,
      // Capire un messaggio WhatsApp non richiede ragionamenti lunghi.
      output_config: { effort: "low", format: betaZodOutputFormat(SchemaInterpretazione) },
      // Se il modello rifiuta per un falso allarme dei filtri di sicurezza, l'API riprova da sola con un altro modello.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: ISTRUZIONI,
      messages: [{ role: "user", content: componiRichiesta(contesto) }],
    });

    if (risposta.stop_reason === "refusal") {
      throw new Error("Il modello ha rifiutato di interpretare il messaggio");
    }
    if (!risposta.parsed_output) {
      throw new Error(`Interpretazione non valida (stop_reason: ${risposta.stop_reason})`);
    }
    return risposta.parsed_output;
  }
}
