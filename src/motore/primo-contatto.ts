import type { DateTime } from "luxon";
import { saluto } from "../dominio/calendario.js";
import type { Lead, Salone } from "../dominio/tipi.js";

/**
 * Il primo messaggio a un cliente che non ci ha ancora scritto deve essere un
 * template approvato da Meta: testo fisso con dei segnaposto {{1}}, {{2}}.
 * Questi testi vanno registrati identici nel WhatsApp Manager del salone,
 * in italiano, categoria "Utility" (vedi docs/template-whatsapp.md).
 */
export const TEMPLATE = {
  richiesta_auto_giorno: {
    nome: "primo_contatto_richiesta_auto_giorno",
    testo:
      "Buongiorno, sono l'assistente di {{1}}. La ringrazio per la richiesta sulla {{2}}. Mi saprebbe indicare un budget di massima?",
  },
  richiesta_auto_sera: {
    nome: "primo_contatto_richiesta_auto_sera",
    testo:
      "Buonasera, sono l'assistente di {{1}}. La ringrazio per la richiesta sulla {{2}}. Mi saprebbe indicare un budget di massima?",
  },
  richiesta_giorno: {
    nome: "primo_contatto_richiesta_giorno",
    testo:
      "Buongiorno, sono l'assistente di {{1}}. La ringrazio per la sua richiesta. Mi dice per quale auto ci aveva cercato?",
  },
  richiesta_sera: {
    nome: "primo_contatto_richiesta_sera",
    testo:
      "Buonasera, sono l'assistente di {{1}}. La ringrazio per la sua richiesta. Mi dice per quale auto ci aveva cercato?",
  },
  chiamata_giorno: {
    nome: "primo_contatto_chiamata_persa_giorno",
    testo:
      "Buongiorno, sono l'assistente di {{1}}. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato?",
  },
  chiamata_sera: {
    nome: "primo_contatto_chiamata_persa_sera",
    testo:
      "Buonasera, sono l'assistente di {{1}}. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato?",
  },
} as const;

export interface MessaggioTemplate {
  /** Nome del template su Meta. */
  nome: string;
  /** Valori dei segnaposto, in ordine. */
  parametri: string[];
  /** Il testo che riceve il cliente, da salvare nella conversazione. */
  testo: string;
}

export function componiTemplate(
  def: { nome: string; testo: string },
  parametri: string[],
): MessaggioTemplate {
  const testo = def.testo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const valore = parametri[Number(n) - 1];
    if (valore === undefined) throw new Error(`Manca il parametro {{${n}}} del template ${def.nome}`);
    return valore;
  });
  return { nome: def.nome, parametri, testo };
}

/** Sceglie il template giusto per un lead appena arrivato. */
export function primoContatto(lead: Lead, salone: Salone, adesso: DateTime): MessaggioTemplate {
  const sera = saluto(salone, adesso) === "Buonasera";
  if (lead.canale === "chiamata_persa") {
    return componiTemplate(sera ? TEMPLATE.chiamata_sera : TEMPLATE.chiamata_giorno, [salone.nome]);
  }
  if (lead.autoInteresse) {
    return componiTemplate(sera ? TEMPLATE.richiesta_auto_sera : TEMPLATE.richiesta_auto_giorno, [
      salone.nome,
      lead.autoInteresse,
    ]);
  }
  return componiTemplate(sera ? TEMPLATE.richiesta_sera : TEMPLATE.richiesta_giorno, [salone.nome]);
}
