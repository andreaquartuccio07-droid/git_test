import { randomUUID } from "node:crypto";
import type { Evento } from "../motore/motore.js";
import type { Lead, Salone } from "../dominio/tipi.js";
import {
  leadIniziale,
  type Archivio,
  type MessaggioArchiviato,
  type NuovoLead,
  type NuovoMessaggio,
} from "./archivio.js";

/** Archivio in memoria: per i test e per provare il server senza database. */
export class ArchivioInMemoria implements Archivio {
  readonly saloni = new Map<string, Salone>();
  readonly leads = new Map<string, Lead>();
  readonly messaggiPerLead = new Map<string, MessaggioArchiviato[]>();
  readonly eventi: { leadId: string; evento: Evento }[] = [];
  private readonly whatsappIds = new Set<string>();
  private progressivo = 0;

  constructor(saloni: Salone[] = []) {
    for (const s of saloni) this.saloni.set(s.id, s);
  }

  async salone(id: string) {
    return this.saloni.get(id) ?? null;
  }

  async saloneDaNumeroWhatsApp(phoneNumberId: string) {
    return [...this.saloni.values()].find((s) => s.whatsappPhoneNumberId === phoneNumberId) ?? null;
  }

  async lead(id: string) {
    const l = this.leads.get(id);
    return l ? structuredClone(l) : null;
  }

  async leadAperto(saloneId: string, telefono: string) {
    const l = this.cerca(saloneId, telefono).find(
      (x) => x.stato === "in_conversazione" || x.stato === "appuntamento",
    );
    return l ? structuredClone(l) : null;
  }

  async ultimoLead(saloneId: string, telefono: string) {
    const l = this.cerca(saloneId, telefono)[0];
    return l ? structuredClone(l) : null;
  }

  async creaLead(dati: NuovoLead) {
    const lead = leadIniziale(randomUUID(), dati, new Date().toISOString());
    this.leads.set(lead.id, lead);
    return structuredClone(lead);
  }

  async salvaLead(lead: Lead) {
    this.leads.set(lead.id, structuredClone(lead));
  }

  async aggiungiMessaggio(lead: Lead, m: NuovoMessaggio) {
    if (m.whatsappId) {
      if (this.whatsappIds.has(m.whatsappId)) return false;
      this.whatsappIds.add(m.whatsappId);
    }
    const lista = this.messaggiPerLead.get(lead.id) ?? [];
    lista.push({
      id: String(++this.progressivo),
      autore: m.autore,
      testo: m.testo,
      tipo: m.tipo ?? "testo",
      elaborato: m.elaborato,
      il: m.il ?? new Date().toISOString(),
    });
    this.messaggiPerLead.set(lead.id, lista);
    return true;
  }

  async messaggi(leadId: string, limite: number) {
    return structuredClone((this.messaggiPerLead.get(leadId) ?? []).slice(-limite));
  }

  async segnaElaborati(ids: string[]) {
    for (const lista of this.messaggiPerLead.values()) {
      for (const m of lista) if (ids.includes(m.id)) m.elaborato = true;
    }
  }

  async registraEventi(lead: Lead, eventi: Evento[]) {
    for (const evento of eventi) this.eventi.push({ leadId: lead.id, evento });
  }

  /** I lead di quel numero, dal più recente. */
  private cerca(saloneId: string, telefono: string): Lead[] {
    return [...this.leads.values()]
      .filter((l) => l.saloneId === saloneId && l.telefono === telefono)
      .reverse();
  }
}
