import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { Conversazioni, RichiestaNonValida } from "../servizio/conversazioni.js";
import { firmaValida, leggiWebhook } from "../whatsapp/whatsapp.js";

export interface ConfigurazioneApp {
  conversazioni: Conversazioni;
  /** Segreto dell'app Meta: serve a verificare che i webhook arrivino da Meta. */
  segretoAppWhatsApp: string;
  /** Parola scelta da noi e inserita nella configurazione del webhook su Meta. */
  tokenVerificaWhatsApp: string;
  /** Token per chiamare le API interne (creazione lead). */
  tokenAmministrazione: string;
  log?: Pick<Console, "info" | "error">;
}

const SchemaNuovoLead = z.object({
  salone_id: z.string().min(1),
  telefono: z.string().min(5),
  canale: z.enum(["portale", "sito", "chiamata_persa"]),
  fonte: z.string().optional(),
  nome: z.string().optional(),
  auto: z.string().optional(),
});

function stessoToken(ricevuto: string | undefined, atteso: string): boolean {
  if (!ricevuto) return false;
  const a = Buffer.from(ricevuto);
  const b = Buffer.from(atteso);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function creaApp(cfg: ConfigurazioneApp): Hono {
  const log = cfg.log ?? console;
  const app = new Hono();

  app.get("/salute", (c) => c.json({ ok: true }));

  // Meta chiama questo indirizzo una volta, quando si configura il webhook.
  app.get("/webhook/whatsapp", (c) => {
    const modo = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const sfida = c.req.query("hub.challenge");
    if (modo === "subscribe" && stessoToken(token, cfg.tokenVerificaWhatsApp) && sfida) {
      return c.text(sfida);
    }
    return c.text("Verifica non riuscita", 403);
  });

  // I messaggi dei clienti.
  app.post("/webhook/whatsapp", async (c) => {
    const corpo = await c.req.text();
    if (!firmaValida(corpo, c.req.header("x-hub-signature-256"), cfg.segretoAppWhatsApp)) {
      log.error("Webhook WhatsApp con firma non valida: scartato");
      return c.text("Firma non valida", 401);
    }
    let dati: unknown;
    try {
      dati = JSON.parse(corpo);
    } catch {
      return c.text("JSON non valido", 400);
    }
    // Si salva ogni messaggio prima di rispondere a Meta: se qualcosa va storto
    // Meta riprova, e i doppioni vengono scartati.
    for (const m of leggiWebhook(dati)) {
      await cfg.conversazioni.messaggioInArrivo(m);
    }
    return c.text("ok");
  });

  // Un nuovo lead (dai portali, dal sito, da una chiamata persa).
  app.post("/api/lead", async (c) => {
    const autorizzazione = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!stessoToken(autorizzazione, cfg.tokenAmministrazione)) {
      return c.json({ errore: "Non autorizzato" }, 401);
    }
    const dati = SchemaNuovoLead.safeParse(await c.req.json().catch(() => null));
    if (!dati.success) {
      return c.json({ errore: "Dati non validi", dettagli: z.treeifyError(dati.error) }, 400);
    }
    try {
      const { lead, nuovo } = await cfg.conversazioni.nuovoLead({
        saloneId: dati.data.salone_id,
        telefono: dati.data.telefono,
        canale: dati.data.canale,
        fonte: dati.data.fonte ?? null,
        nome: dati.data.nome ?? null,
        autoInteresse: dati.data.auto ?? null,
      });
      return c.json({ lead_id: lead.id, nuovo }, nuovo ? 201 : 200);
    } catch (e) {
      if (e instanceof RichiestaNonValida) return c.json({ errore: e.message }, 400);
      throw e;
    }
  });

  app.onError((e, c) => {
    log.error("Errore del server:", e);
    return c.json({ errore: "Errore interno" }, 500);
  });

  return app;
}
