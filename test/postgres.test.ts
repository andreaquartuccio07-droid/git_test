import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArchivioPostgres } from "../src/archivio/postgres.js";
import { saloneDemo } from "../src/config/salone-demo.js";
import { Conversazioni } from "../src/servizio/conversazioni.js";
import { WhatsAppFinto } from "../src/whatsapp/whatsapp.js";
import { InterpreteFinto, LUNEDI_SERA } from "./aiuti.js";

/**
 * Prova l'archivio su un Postgres vero, con le migrazioni del progetto.
 * Gira solo se è impostata TEST_DATABASE_URL (un database usa e getta: viene svuotato).
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("archivio Postgres", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query(`drop schema if exists public cascade; drop schema if exists auth cascade;
      create schema public; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
    for (const f of readdirSync("supabase/migrations").sort()) {
      await pool.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
    }
    await pool.query(readFileSync("supabase/seed-demo.sql", "utf8"));
    await pool.query(`update saloni set whatsapp_phone_number_id = '111'`);
  });
  afterAll(() => pool?.end());

  it("legge il salone come lo usa il motore", async () => {
    const archivio = new ArchivioPostgres(pool);
    expect(await archivio.saloneDaNumeroWhatsApp("111")).toEqual({ ...saloneDemo, whatsappPhoneNumberId: "111" });
  });

  it("porta una conversazione fino all'appuntamento salvando tutto", async () => {
    const archivio = new ArchivioPostgres(pool);
    const whatsapp = new WhatsAppFinto();
    const conversazioni = new Conversazioni({
      archivio,
      whatsapp,
      interprete: new InterpreteFinto({
        "12 mila, a rate": { budget: "12000", finanziamento: "si" },
        "ho una Punto": { permuta: "si", usato: "Fiat Punto" },
        "martedì": { giorno: "2026-10-06" },
        "alle 18": { ora: "18:00" },
      }),
      attesaMs: 0,
      adesso: () => LUNEDI_SERA,
      log: { info: () => {}, error: () => {} },
    });
    const { lead } = await conversazioni.nuovoLead({
      saloneId: saloneDemo.id, telefono: "3331234567", canale: "portale", nome: "Mario Rossi", autoInteresse: "Fiat Tipo",
    });
    const scrivi = async (id: string, testo: string) => {
      await conversazioni.messaggioInArrivo({
        phoneNumberId: "111", da: "393331234567", nomeProfilo: null, whatsappId: id, tipo: "testo", testo,
        il: LUNEDI_SERA.toISO()!,
      });
      await conversazioni.attendi();
    };
    await scrivi("w1", "12 mila, a rate");
    await scrivi("w1", "12 mila, a rate"); // doppione da Meta
    await scrivi("w2", "ho una Punto");
    await scrivi("w3", "martedì");
    await scrivi("w4", "alle 18");

    expect(whatsapp.inviati.at(-1)!.testo).toBe(
      "Perfetto, la aspettiamo martedì 6 ottobre alle 18:00. Per la verifica del finanziamento porti un documento d'identità, il codice fiscale e l'ultima busta paga. Se le cambia qualcosa mi scriva qui.",
    );
    const salvato = await archivio.lead(lead.id);
    expect(salvato).toMatchObject({
      stato: "appuntamento",
      budget: "12000",
      finanziamento: true,
      permuta: true,
      usato: "Fiat Punto",
      giornoProposto: null,
      oraProposta: null,
      appuntamento: "2026-10-06T16:00:00.000Z",
    });
    const messaggi = await archivio.messaggi(lead.id, 50);
    expect(messaggi.map((m) => m.autore)).toEqual(["bot", "cliente", "bot", "cliente", "bot", "cliente", "bot", "cliente", "bot"]);
    expect(messaggi.every((m) => m.elaborato)).toBe(true);
    const { rows } = await pool.query(`select tipo, dati from eventi where lead_id = $1`, [lead.id]);
    expect(rows).toEqual([{ tipo: "appuntamento_fissato", dati: { quando: "2026-10-06T18:00:00.000+02:00" } }]);
  });

  it("un secondo lead aperto per lo stesso numero non viene creato", async () => {
    const archivio = new ArchivioPostgres(pool);
    await expect(
      archivio.creaLead({ saloneId: saloneDemo.id, telefono: "+393331234567", canale: "sito" }),
    ).rejects.toThrow(/leads_aperti_per_telefono/);
  });
});
