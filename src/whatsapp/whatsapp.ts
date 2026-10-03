import { createHmac, timingSafeEqual } from "node:crypto";
import type { TipoMessaggio } from "../dominio/tipi.js";
import type { MessaggioTemplate } from "../motore/primo-contatto.js";

/** Un messaggio ricevuto da un cliente, già estratto dal formato di Meta. */
export interface MessaggioInArrivo {
  /** Il numero WhatsApp del salone che ha ricevuto il messaggio. */
  phoneNumberId: string;
  /** Numero del cliente, senza +. */
  da: string;
  /** Nome del profilo WhatsApp del cliente, se c'è. */
  nomeProfilo: string | null;
  whatsappId: string;
  tipo: TipoMessaggio;
  /** Il testo, oppure null per vocali, foto e altro. */
  testo: string | null;
  il: string;
}

/** Chi spedisce i messaggi su WhatsApp. */
export interface InvioWhatsApp {
  /** Restituisce l'id del messaggio presso WhatsApp. */
  inviaTesto(phoneNumberId: string, a: string, testo: string): Promise<string | null>;
  inviaTemplate(phoneNumberId: string, a: string, template: MessaggioTemplate): Promise<string | null>;
}

/**
 * Controlla che la richiesta arrivi davvero da Meta: Meta firma il corpo della
 * richiesta con il segreto dell'app (intestazione X-Hub-Signature-256).
 */
export function firmaValida(corpo: string, intestazione: string | undefined, segretoApp: string): boolean {
  if (!intestazione?.startsWith("sha256=")) return false;
  const attesa = createHmac("sha256", segretoApp).update(corpo, "utf8").digest();
  const ricevuta = Buffer.from(intestazione.slice("sha256=".length), "hex");
  return ricevuta.length === attesa.length && timingSafeEqual(ricevuta, attesa);
}

/** Estrae i messaggi dei clienti dal webhook di Meta, ignorando le conferme di consegna e lettura. */
export function leggiWebhook(corpo: unknown): MessaggioInArrivo[] {
  const risultato: MessaggioInArrivo[] = [];
  const entries = (corpo as any)?.entry;
  if (!Array.isArray(entries)) return risultato;
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const contatti = new Map<string, string>(
        (value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? null]),
      );
      for (const m of value.messages ?? []) {
        if (!m?.from || !m?.id) continue;
        const [tipo, testo] = contenuto(m);
        risultato.push({
          phoneNumberId,
          da: m.from,
          nomeProfilo: contatti.get(m.from) ?? null,
          whatsappId: m.id,
          tipo,
          testo,
          il: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
        });
      }
    }
  }
  return risultato;
}

function contenuto(m: any): [TipoMessaggio, string | null] {
  switch (m.type) {
    case "text":
      return ["testo", m.text?.body ?? ""];
    case "button":
      return ["testo", m.button?.text ?? ""];
    case "interactive":
      return ["testo", m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ""];
    case "audio":
      return ["vocale", null];
    case "image":
      // Una foto con didascalia: il bot legge la didascalia.
      return m.image?.caption ? ["testo", m.image.caption] : ["immagine", null];
    default:
      return ["altro", null];
  }
}

/** Invio vero, tramite la WhatsApp Cloud API di Meta. */
export class WhatsAppCloud implements InvioWhatsApp {
  constructor(
    private readonly token: string,
    private readonly versioneApi = "v23.0",
  ) {}

  inviaTesto(phoneNumberId: string, a: string, testo: string) {
    return this.invia(phoneNumberId, {
      to: a,
      type: "text",
      text: { body: testo, preview_url: false },
    });
  }

  inviaTemplate(phoneNumberId: string, a: string, t: MessaggioTemplate) {
    return this.invia(phoneNumberId, {
      to: a,
      type: "template",
      template: {
        name: t.nome,
        language: { code: "it" },
        components: [
          { type: "body", parameters: t.parametri.map((p) => ({ type: "text", text: p })) },
        ],
      },
    });
  }

  private async invia(phoneNumberId: string, messaggio: object): Promise<string | null> {
    const risposta = await fetch(
      `https://graph.facebook.com/${this.versioneApi}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...messaggio }),
      },
    );
    const corpo: any = await risposta.json().catch(() => null);
    if (!risposta.ok) {
      throw new Error(`WhatsApp ha rifiutato il messaggio (${risposta.status}): ${JSON.stringify(corpo?.error ?? corpo)}`);
    }
    return corpo?.messages?.[0]?.id ?? null;
  }
}

/** Finto invio: scrive i messaggi a terminale e li tiene in memoria. Per i test e le prove senza Meta. */
export class WhatsAppFinto implements InvioWhatsApp {
  readonly inviati: { a: string; testo: string; template: string | null }[] = [];
  constructor(private readonly stampa = false) {}

  async inviaTesto(_phoneNumberId: string, a: string, testo: string) {
    return this.registra(a, testo, null);
  }

  async inviaTemplate(_phoneNumberId: string, a: string, t: MessaggioTemplate) {
    return this.registra(a, t.testo, t.nome);
  }

  private registra(a: string, testo: string, template: string | null) {
    this.inviati.push({ a, testo, template });
    if (this.stampa) console.log(`[WhatsApp → +${a}]${template ? ` (template ${template})` : ""} ${testo}`);
    return `finto-${this.inviati.length}`;
  }
}
