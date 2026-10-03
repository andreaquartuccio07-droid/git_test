import type { DateTime } from "luxon";
import { z } from "zod";
import type { GiornoCalendario } from "../dominio/calendario.js";
import type { Lead, Messaggio, Salone } from "../dominio/tipi.js";

/**
 * Cosa l'AI ricava da un messaggio del cliente. L'AI non scrive mai le risposte:
 * capisce il messaggio, poi è il codice a decidere cosa rispondere.
 */
export const SchemaInterpretazione = z.object({
  intento: z.enum([
    "normale",
    "conferma",
    "disdice_o_sposta",
    "non_interessato",
    "altro_motivo",
    "fuori_tema",
    "vuole_una_persona",
    "ambiguo",
  ]),
  auto_cercata: z.string().nullable(),
  budget: z.string().nullable(),
  finanziamento: z.enum(["si", "no"]).nullable(),
  permuta: z.enum(["si", "no"]).nullable(),
  usato: z.string().nullable(),
  giorno: z.string().nullable(),
  ora: z.string().nullable(),
  libero_dalle: z.string().nullable(),
  nome: z.string().nullable(),
  cognome: z.string().nullable(),
  genere: z.enum(["M", "F"]).nullable(),
  richiamabile: z.enum(["si", "no"]).nullable(),
  domande: z.array(
    z.object({
      tipo: z.enum([
        "prezzo",
        "valutazione_usato",
        "finanziamento",
        "disponibilita_auto",
        "orari",
        "indirizzo",
        "altro",
      ]),
      testo: z.string(),
    }),
  ),
});

export type Interpretazione = z.infer<typeof SchemaInterpretazione>;
export type TipoDomanda = Interpretazione["domande"][number]["tipo"];

export interface ContestoInterpretazione {
  salone: Salone;
  lead: Lead;
  /** Ultimi messaggi della conversazione, dal più vecchio al più recente. */
  storico: Messaggio[];
  /** Il messaggio del cliente da interpretare. */
  testo: string;
  adesso: DateTime;
  calendario: GiornoCalendario[];
}

export interface Interprete {
  interpreta(contesto: ContestoInterpretazione): Promise<Interpretazione>;
}

/** Un'interpretazione vuota, da completare: comoda per i test e come base. */
export function interpretazioneVuota(): Interpretazione {
  return {
    intento: "normale",
    auto_cercata: null,
    budget: null,
    finanziamento: null,
    permuta: null,
    usato: null,
    giorno: null,
    ora: null,
    libero_dalle: null,
    nome: null,
    cognome: null,
    genere: null,
    richiamabile: null,
    domande: [],
  };
}
