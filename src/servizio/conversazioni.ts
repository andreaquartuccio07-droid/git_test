import { DateTime } from "luxon";
import type { Interprete } from "../ai/interpretazione.js";
import type { Archivio, NuovoLead } from "../archivio/archivio.js";
import { normalizzaTelefono, telefonoDaWhatsApp, telefonoPerWhatsApp } from "../dominio/telefono.js";
import type { Lead, Messaggio, Salone } from "../dominio/tipi.js";
import { frasi } from "../motore/frasi.js";
import { avviaConversazione, gestisciMessaggio, type Esito, type Evento } from "../motore/motore.js";
import type { InvioWhatsApp, MessaggioInArrivo } from "../whatsapp/whatsapp.js";

/** Quanti messaggi passati si danno all'AI per capire la conversazione. */
const MESSAGGI_DI_CONTESTO = 20;

export interface Dipendenze {
  archivio: Archivio;
  whatsapp: InvioWhatsApp;
  interprete: Interprete;
  /**
   * Quanto aspettare dopo un messaggio del cliente prima di rispondere: se nel
   * frattempo ne manda altri, il bot li legge tutti insieme e risponde una volta.
   */
  attesaMs: number;
  adesso?: () => DateTime;
  log?: Pick<Console, "info" | "error">;
}

export class RichiestaNonValida extends Error {}

/**
 * Collega WhatsApp, archivio e motore: crea i lead, riceve i messaggi,
 * risponde. I messaggi dello stesso lead sono elaborati uno alla volta.
 */
export class Conversazioni {
  private readonly code = new Map<string, Promise<void>>();
  private readonly inCorso = new Set<Promise<void>>();
  private readonly adesso: () => DateTime;
  private readonly log: Pick<Console, "info" | "error">;

  constructor(private readonly d: Dipendenze) {
    this.adesso = d.adesso ?? (() => DateTime.now());
    this.log = d.log ?? console;
  }

  /**
   * Un nuovo contatto da portale, sito o chiamata persa: crea il lead e manda
   * il primo messaggio. Se il cliente ha già una conversazione in corso, la
   * nuova richiesta si aggiunge a quella senza riscrivergli da capo.
   */
  async nuovoLead(dati: NuovoLead): Promise<{ lead: Lead; nuovo: boolean }> {
    const salone = await this.d.archivio.salone(dati.saloneId);
    if (!salone) throw new RichiestaNonValida("Salone sconosciuto");
    const telefono = normalizzaTelefono(dati.telefono);
    if (!telefono) throw new RichiestaNonValida(`Numero di telefono non valido: ${dati.telefono}`);

    const aperto = await this.d.archivio.leadAperto(salone.id, telefono);
    if (aperto) {
      if (!aperto.autoInteresse && dati.autoInteresse) {
        aperto.autoInteresse = dati.autoInteresse;
        await this.d.archivio.salvaLead(aperto);
      }
      await this.d.archivio.registraEventi(aperto, [
        { tipo: "nuova_richiesta", canale: dati.canale, fonte: dati.fonte ?? null, auto: dati.autoInteresse ?? null },
      ]);
      return { lead: aperto, nuovo: false };
    }

    const lead = await this.d.archivio.creaLead({ ...dati, telefono });
    const template = avviaConversazione(lead, salone, this.adesso());
    const whatsappId = await this.invia(salone, lead, () =>
      this.d.whatsapp.inviaTemplate(numeroSalone(salone), telefonoPerWhatsApp(telefono), template),
    );
    await this.d.archivio.aggiungiMessaggio(lead, {
      autore: "bot",
      testo: template.testo,
      elaborato: true,
      whatsappId,
    });
    this.log.info(`Nuovo lead ${lead.id} (${lead.canale}) per ${salone.nome}`);
    return { lead, nuovo: true };
  }

  /** Un messaggio arrivato dal webhook: lo salva subito e programma la risposta. */
  async messaggioInArrivo(m: MessaggioInArrivo): Promise<void> {
    const salone = await this.d.archivio.saloneDaNumeroWhatsApp(m.phoneNumberId);
    if (!salone) {
      this.log.error(`Messaggio per un numero WhatsApp senza salone: ${m.phoneNumberId}`);
      return;
    }
    const telefono = telefonoDaWhatsApp(m.da);
    const lead =
      (await this.d.archivio.leadAperto(salone.id, telefono)) ??
      (await this.d.archivio.ultimoLead(salone.id, telefono)) ??
      (await this.d.archivio.creaLead({
        saloneId: salone.id,
        telefono,
        canale: "whatsapp",
        // Il nome del profilo WhatsApp è spesso un soprannome: lo vede il venditore,
        // ma il bot chiede comunque nome e cognome prima di confermare.
        fonte: m.nomeProfilo ? `profilo WhatsApp: ${m.nomeProfilo}` : null,
      }));

    const nuovo = await this.d.archivio.aggiungiMessaggio(lead, {
      autore: "cliente",
      testo: m.testo ?? `[${m.tipo}]`,
      tipo: m.tipo,
      elaborato: false,
      whatsappId: m.whatsappId,
      il: m.il,
    });
    // Meta a volte manda lo stesso messaggio due volte: il secondo si ignora.
    if (!nuovo) return;
    this.programma(lead.id);
  }

  /** Aspetta che tutte le risposte programmate siano state mandate (per i test e lo spegnimento). */
  async attendi(): Promise<void> {
    while (this.inCorso.size > 0) await Promise.all([...this.inCorso]);
  }

  private programma(leadId: string) {
    const lavoro = new Promise<void>((fatto) => setTimeout(fatto, this.d.attesaMs))
      .then(() => this.inCoda(leadId, () => this.elabora(leadId)))
      .catch((e) => this.log.error(`Errore sul lead ${leadId}:`, e))
      .finally(() => this.inCorso.delete(lavoro));
    this.inCorso.add(lavoro);
  }

  /** Esegue i lavori dello stesso lead uno dopo l'altro, mai in parallelo. */
  private inCoda(chiave: string, lavoro: () => Promise<void>): Promise<void> {
    const precedente = this.code.get(chiave) ?? Promise.resolve();
    const prossimo = precedente.then(lavoro, lavoro);
    const coda = prossimo.catch(() => {});
    this.code.set(chiave, coda);
    void coda.then(() => {
      if (this.code.get(chiave) === coda) this.code.delete(chiave);
    });
    return prossimo;
  }

  /** Legge i messaggi del cliente non ancora elaborati e risponde una volta sola. */
  private async elabora(leadId: string): Promise<void> {
    const { archivio } = this.d;
    const lead = await archivio.lead(leadId);
    if (!lead) return;
    const salone = await archivio.salone(lead.saloneId);
    if (!salone) return;

    const messaggi = await archivio.messaggi(leadId, MESSAGGI_DI_CONTESTO + 10);
    const nuovi = messaggi.filter((m) => m.autore === "cliente" && !m.elaborato);
    if (nuovi.length === 0) return; // già elaborati insieme a un messaggio precedente
    const storico: Messaggio[] = messaggi
      .filter((m) => m.elaborato)
      .slice(-MESSAGGI_DI_CONTESTO)
      .map(({ autore, testo, il }) => ({ autore, testo, il }));

    const adesso = this.adesso();
    const testi = nuovi.filter((m) => m.tipo === "testo").map((m) => m.testo);
    let esito: Esito;
    if (testi.length === 0) {
      esito = rispostaANonTesto(lead, adesso);
    } else {
      try {
        esito = await gestisciMessaggio({ salone, lead, storico, testo: testi.join("\n"), adesso }, this.d.interprete);
      } catch (e) {
        // Se l'AI non risponde, il cliente non resta senza risposta: lo richiama una persona.
        this.log.error(`Interpretazione fallita per il lead ${leadId}:`, e);
        esito = {
          risposta: frasi.richiamo(salone, adesso),
          lead: { ...lead, stato: "da_richiamare", ultimoMessaggioIl: adesso.toISO() },
          eventi: [{ tipo: "da_richiamare", motivo: "errore tecnico nell'interpretazione del messaggio" }],
        };
      }
    }

    await archivio.salvaLead(esito.lead);
    await archivio.segnaElaborati(nuovi.map((m) => m.id));
    await archivio.registraEventi(esito.lead, esito.eventi);

    if (esito.risposta) {
      const testo = esito.risposta;
      const whatsappId = await this.invia(salone, esito.lead, () =>
        this.d.whatsapp.inviaTesto(numeroSalone(salone), telefonoPerWhatsApp(lead.telefono), testo),
      );
      await archivio.aggiungiMessaggio(esito.lead, { autore: "bot", testo, elaborato: true, whatsappId });
    }
  }

  /** Spedisce un messaggio; se WhatsApp lo rifiuta, lo registra come evento per il venditore. */
  private async invia(salone: Salone, lead: Lead, spedisci: () => Promise<string | null>) {
    try {
      return await spedisci();
    } catch (e) {
      this.log.error(`Invio WhatsApp fallito per il lead ${lead.id} di ${salone.nome}:`, e);
      const evento: Evento = { tipo: "invio_fallito", errore: e instanceof Error ? e.message : String(e) };
      await this.d.archivio.registraEventi(lead, [evento]);
      return null;
    }
  }
}

function numeroSalone(salone: Salone): string {
  if (!salone.whatsappPhoneNumberId) throw new Error(`Il salone ${salone.nome} non ha un numero WhatsApp configurato`);
  return salone.whatsappPhoneNumberId;
}

/** Vocali e foto: il bot non li capisce e chiede di scrivere, se sta ancora seguendo il cliente. */
function rispostaANonTesto(lead: Lead, adesso: DateTime): Esito {
  const attivo = lead.stato === "in_conversazione" || lead.stato === "appuntamento";
  return {
    risposta: attivo ? frasi.vocale : null,
    lead: { ...lead, ultimoMessaggioIl: adesso.toISO() },
    eventi: attivo ? [] : [{ tipo: "messaggio_senza_risposta", motivo: lead.stato }],
  };
}
