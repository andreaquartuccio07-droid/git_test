import { DateTime } from "luxon";
import type { Fascia, Salone } from "./tipi.js";

/** Quanti giorni avanti il cliente può prenotare. */
export const GIORNI_PRENOTABILI = 14;
/** Durata minima tra l'appuntamento e la chiusura della fascia. */
const MINUTI_PRIMA_DELLA_CHIUSURA = 30;
/** Per un appuntamento oggi, quanto preavviso serve. */
const MINUTI_PREAVVISO_OGGI = 60;

export interface GiornoCalendario {
  /** AAAA-MM-GG */
  data: string;
  /** "martedì 7 ottobre" */
  etichetta: string;
  oggi: boolean;
  aperto: boolean;
}

function minuti(ora: string): number {
  const [h, m] = ora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function daMinuti(totale: number): string {
  const h = Math.floor(totale / 60);
  const m = totale % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function giorno(data: string, salone: Salone): DateTime {
  return DateTime.fromISO(data, { zone: salone.fusoOrario }).setLocale("it");
}

export function etichettaData(data: string, salone: Salone): string {
  return giorno(data, salone).toFormat("cccc d LLLL");
}

/** "18:00" resta "18:00", "09:30" diventa "9:30": come lo scriverebbe una persona. */
export function oraLeggibile(ora: string): string {
  return ora.replace(/^0(\d)/, "$1");
}

export function fasceDelGiorno(data: string, salone: Salone): Fascia[] {
  if (salone.chiusure.includes(data)) return [];
  const wd = giorno(data, salone).weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  return salone.orari[wd] ?? [];
}

/** Oggi più i prossimi giorni prenotabili, con l'indicazione di quali sono aperti. */
export function calendario(salone: Salone, adesso: DateTime): GiornoCalendario[] {
  const oggi = adesso.setZone(salone.fusoOrario).startOf("day");
  const giorni: GiornoCalendario[] = [];
  for (let i = 0; i <= GIORNI_PRENOTABILI; i++) {
    const d = oggi.plus({ days: i });
    const data = d.toISODate()!;
    giorni.push({
      data,
      etichetta: etichettaData(data, salone),
      oggi: i === 0,
      aperto: fasceDelGiorno(data, salone).length > 0,
    });
  }
  return giorni;
}

/** "dalle 9:00 alle 12:30 e dalle 15:00 alle 19:00" */
export function descriviOrari(fasce: Fascia[]): string {
  return fasce
    .map((f) => `dalle ${oraLeggibile(f.da)} alle ${oraLeggibile(f.a)}`)
    .join(" e ");
}

export type EsitoOrario =
  | { valido: true }
  | { valido: false; motivo: "giorno_chiuso" | "fuori_orario" | "troppo_presto" | "fuori_calendario" };

export function verificaOrario(
  salone: Salone,
  data: string,
  ora: string,
  adesso: DateTime,
): EsitoOrario {
  const giorni = calendario(salone, adesso);
  const g = giorni.find((x) => x.data === data);
  if (!g) return { valido: false, motivo: "fuori_calendario" };
  const fasce = fasceDelGiorno(data, salone);
  if (fasce.length === 0) return { valido: false, motivo: "giorno_chiuso" };
  const m = minuti(ora);
  const dentro = fasce.some(
    (f) => m >= minuti(f.da) && m <= minuti(f.a) - MINUTI_PRIMA_DELLA_CHIUSURA,
  );
  if (!dentro) return { valido: false, motivo: "fuori_orario" };
  if (g.oggi) {
    const ora_adesso = adesso.setZone(salone.fusoOrario);
    const minutiAdesso = ora_adesso.hour * 60 + ora_adesso.minute;
    if (m < minutiAdesso + MINUTI_PREAVVISO_OGGI) return { valido: false, motivo: "troppo_presto" };
  }
  return { valido: true };
}

/**
 * Il cliente ha detto quando si libera (es. "stacco alle 17"): proponiamo due
 * orari con margine per arrivare, arrotondati al quarto d'ora (17:45 o 18:00).
 */
export function proponiOrari(
  salone: Salone,
  data: string,
  liberoDalle: string,
  adesso: DateTime,
): string[] {
  let m = minuti(liberoDalle) + 45;
  m = Math.ceil(m / 15) * 15;
  const proposte: string[] = [];
  for (; m < 24 * 60 && proposte.length < 2; m += 15) {
    const ora = daMinuti(m);
    if (verificaOrario(salone, data, ora, adesso).valido) proposte.push(ora);
  }
  return proposte;
}

/** Converte data e ora locali del salone in un timestamp ISO con fuso orario. */
export function istante(salone: Salone, data: string, ora: string): string {
  return DateTime.fromISO(`${data}T${ora}`, { zone: salone.fusoOrario }).toISO()!;
}

export function saluto(salone: Salone, adesso: DateTime): string {
  return adesso.setZone(salone.fusoOrario).hour < salone.oraSera ? "Buongiorno" : "Buonasera";
}

export function congedo(salone: Salone, adesso: DateTime): string {
  return adesso.setZone(salone.fusoOrario).hour < salone.oraSera ? "Buona giornata" : "Buona serata";
}
