/**
 * Avvio del server. Tutta la configurazione arriva dalle variabili d'ambiente
 * (vedi .env.example). Senza DATABASE_URL usa un archivio in memoria con il
 * salone demo; senza WHATSAPP_TOKEN scrive i messaggi a terminale invece di
 * mandarli: così si può provare tutto in locale.
 */
import { serve } from "@hono/node-server";
import pg from "pg";
import { z } from "zod";
import { InterpreteClaude } from "../ai/claude.js";
import type { Archivio } from "../archivio/archivio.js";
import { ArchivioInMemoria } from "../archivio/memoria.js";
import { ArchivioPostgres } from "../archivio/postgres.js";
import { saloneDemo } from "../config/salone-demo.js";
import { Conversazioni } from "../servizio/conversazioni.js";
import { WhatsAppCloud, WhatsAppFinto, type InvioWhatsApp } from "../whatsapp/whatsapp.js";
import { creaApp } from "./app.js";

const env = z
  .object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().optional(),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().min(1, "serve il segreto dell'app Meta"),
    WHATSAPP_VERIFY_TOKEN: z.string().min(8, "scegli una parola di almeno 8 caratteri"),
    ADMIN_TOKEN: z.string().min(24, "usa un token lungo almeno 24 caratteri"),
    ATTESA_RISPOSTA_SECONDI: z.coerce.number().min(0).default(8),
  })
  .parse(process.env);

let archivio: Archivio;
let pool: pg.Pool | null = null;
if (env.DATABASE_URL) {
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
  archivio = new ArchivioPostgres(pool);
  console.info("Archivio: Postgres");
} else {
  archivio = new ArchivioInMemoria([{ ...saloneDemo, whatsappPhoneNumberId: saloneDemo.whatsappPhoneNumberId ?? "demo" }]);
  console.info("Archivio: in memoria (i dati si perdono al riavvio)");
}

let whatsapp: InvioWhatsApp;
if (env.WHATSAPP_TOKEN) {
  whatsapp = new WhatsAppCloud(env.WHATSAPP_TOKEN);
  console.info("WhatsApp: Cloud API di Meta");
} else {
  whatsapp = new WhatsAppFinto(true);
  console.info("WhatsApp: finto, i messaggi vengono solo scritti qui");
}

const conversazioni = new Conversazioni({
  archivio,
  whatsapp,
  interprete: new InterpreteClaude(),
  attesaMs: env.ATTESA_RISPOSTA_SECONDI * 1000,
});

const app = creaApp({
  conversazioni,
  segretoAppWhatsApp: env.WHATSAPP_APP_SECRET,
  tokenVerificaWhatsApp: env.WHATSAPP_VERIFY_TOKEN,
  tokenAmministrazione: env.ADMIN_TOKEN,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`Server in ascolto sulla porta ${info.port}`);
});

// Allo spegnimento si finisce di rispondere ai clienti in attesa.
async function spegni() {
  console.info("Spegnimento: finisco le risposte in corso...");
  server.close();
  await conversazioni.attendi();
  await pool?.end();
  process.exit(0);
}
process.on("SIGTERM", spegni);
process.on("SIGINT", spegni);
