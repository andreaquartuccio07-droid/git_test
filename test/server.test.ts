import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ArchivioInMemoria } from "../src/archivio/memoria.js";
import { saloneDemo } from "../src/config/salone-demo.js";
import { creaApp } from "../src/server/app.js";
import { Conversazioni } from "../src/servizio/conversazioni.js";
import { WhatsAppFinto } from "../src/whatsapp/whatsapp.js";
import { InterpreteFinto, LUNEDI_SERA } from "./aiuti.js";
import { messaggioTesto, webhookMeta } from "./whatsapp.test.js";

const SEGRETO = "segreto-app-meta";
const ADMIN = "token-amministrazione-molto-lungo";
const NUMERO_SALONE = "111";
const silenzioso = { info: () => {}, error: () => {} };

function firma(corpo: string) {
  return "sha256=" + createHmac("sha256", SEGRETO).update(corpo).digest("hex");
}

function prepara(risposte: ConstructorParameters<typeof InterpreteFinto>[0] = {}, interprete = new InterpreteFinto(risposte)) {
  const archivio = new ArchivioInMemoria([{ ...saloneDemo, whatsappPhoneNumberId: NUMERO_SALONE }]);
  const whatsapp = new WhatsAppFinto();
  const conversazioni = new Conversazioni({
    archivio,
    whatsapp,
    interprete,
    attesaMs: 0,
    adesso: () => LUNEDI_SERA,
    log: silenzioso,
  });
  const app = creaApp({
    conversazioni,
    segretoAppWhatsApp: SEGRETO,
    tokenVerificaWhatsApp: "parola-di-verifica",
    tokenAmministrazione: ADMIN,
    log: silenzioso,
  });

  const dalCliente = async (...messaggi: object[]) => {
    const corpo = JSON.stringify(webhookMeta(messaggi, NUMERO_SALONE));
    const r = await app.request("/webhook/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": firma(corpo), "content-type": "application/json" },
      body: corpo,
    });
    await conversazioni.attendi();
    return r;
  };
  const nuovoLead = (dati: object) =>
    app.request("/api/lead", {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ salone_id: saloneDemo.id, ...dati }),
    });
  return { app, archivio, whatsapp, conversazioni, interprete, dalCliente, nuovoLead };
}

describe("verifica del webhook da parte di Meta", () => {
  it("risponde con la sfida solo se il token è giusto", async () => {
    const { app } = prepara();
    const ok = await app.request("/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=parola-di-verifica&hub.challenge=42");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const ko = await app.request("/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=sbagliata&hub.challenge=42");
    expect(ko.status).toBe(403);
  });

  it("scarta i messaggi senza firma valida", async () => {
    const { app, whatsapp } = prepara();
    const r = await app.request("/webhook/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=00" },
      body: JSON.stringify(webhookMeta([messaggioTesto("w1", "ciao")], NUMERO_SALONE)),
    });
    expect(r.status).toBe(401);
    expect(whatsapp.inviati).toEqual([]);
  });
});

describe("dal lead all'appuntamento", () => {
  let t: ReturnType<typeof prepara>;
  beforeEach(() => {
    t = prepara({
      "sui 15000": { budget: "15000" },
      "contanti": { finanziamento: "no" },
      "no": { permuta: "no" },
      "giovedì alle 17": { giorno: "2026-10-08", ora: "17:00" },
    });
  });

  it("crea il lead, manda il template e poi conversa fino alla conferma", async () => {
    const r = await t.nuovoLead({ telefono: "333 123 4567", canale: "portale", fonte: "AutoScout24", nome: "Mario Rossi", auto: "Fiat Tipo" });
    expect(r.status).toBe(201);
    expect(t.whatsapp.inviati).toEqual([
      {
        a: "393331234567",
        template: "primo_contatto_richiesta_auto_sera",
        testo: "Buonasera, sono l'assistente di Autosalone Demo. La ringrazio per la richiesta sulla Fiat Tipo. Mi saprebbe indicare un budget di massima?",
      },
    ]);

    await t.dalCliente(messaggioTesto("w1", "sui 15000"));
    await t.dalCliente(messaggioTesto("w2", "contanti"));
    await t.dalCliente(messaggioTesto("w3", "no"));
    await t.dalCliente(messaggioTesto("w4", "giovedì alle 17"));

    expect(t.whatsapp.inviati.slice(1).map((m) => m.testo)).toEqual([
      "La ringrazio. Pensa di acquistarla con un finanziamento o in un'unica soluzione?",
      "Perfetto, grazie. Ha un usato da dare in permuta?",
      "La ringrazio. Quando potrebbe passare in salone?",
      "Perfetto, la aspettiamo giovedì 8 ottobre alle 17:00. Se le cambia qualcosa mi scriva qui.",
    ]);
    const lead = [...t.archivio.leads.values()][0]!;
    expect(lead).toMatchObject({ stato: "appuntamento", budget: "15000", finanziamento: false, permuta: false, telefono: "+393331234567" });
    expect(t.archivio.eventi.map((e) => e.evento.tipo)).toEqual(["appuntamento_fissato"]);
    // La conversazione intera è salvata, nell'ordine giusto.
    expect(t.archivio.messaggiPerLead.get(lead.id)!.map((m) => m.autore)).toEqual([
      "bot", "cliente", "bot", "cliente", "bot", "cliente", "bot", "cliente", "bot",
    ]);
  });

  it("se il cliente ha già una conversazione aperta, non gli riscrive da capo", async () => {
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    const r = await t.nuovoLead({ telefono: "+39 333 1234567", canale: "sito", auto: "Fiat 500" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ nuovo: false });
    expect(t.whatsapp.inviati).toHaveLength(1);
    expect(t.archivio.eventi.map((e) => e.evento)).toEqual([
      { tipo: "nuova_richiesta", canale: "sito", fonte: null, auto: "Fiat 500" },
    ]);
  });
});

describe("messaggi in arrivo", () => {
  it("più messaggi ravvicinati ricevono una risposta sola", async () => {
    const t = prepara({ "sui 15000\ncontanti\nniente permuta": { budget: "15000", finanziamento: "no", permuta: "no" } });
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    await t.dalCliente(
      messaggioTesto("w1", "sui 15000"),
      messaggioTesto("w2", "contanti"),
      messaggioTesto("w3", "niente permuta"),
    );
    expect(t.interprete.chiamate).toHaveLength(1);
    expect(t.whatsapp.inviati.slice(1).map((m) => m.testo)).toEqual([
      "La ringrazio. Quando potrebbe passare in salone?",
    ]);
  });

  it("lo stesso messaggio mandato due volte da Meta viene elaborato una volta", async () => {
    const t = prepara({ "sui 15000": { budget: "15000" } });
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    await t.dalCliente(messaggioTesto("w1", "sui 15000"));
    await t.dalCliente(messaggioTesto("w1", "sui 15000"));
    expect(t.interprete.chiamate).toHaveLength(1);
    expect(t.whatsapp.inviati).toHaveLength(2);
  });

  it("un cliente sconosciuto che scrive per primo diventa un lead e il bot si presenta", async () => {
    const t = prepara({ "buonasera, cerco una Clio": { auto_cercata: "Renault Clio" } });
    await t.dalCliente(messaggioTesto("w1", "buonasera, cerco una Clio", "393409999999"));
    const lead = [...t.archivio.leads.values()][0]!;
    expect(lead).toMatchObject({ canale: "whatsapp", telefono: "+393409999999", autoInteresse: "Renault Clio" });
    expect(t.whatsapp.inviati).toEqual([
      {
        a: "393409999999",
        template: null,
        testo: "Buonasera, sono l'assistente di Autosalone Demo. La ringrazio. Mi saprebbe indicare un budget di massima?",
      },
    ]);
  });

  it("ai vocali risponde chiedendo di scrivere", async () => {
    const t = prepara();
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    await t.dalCliente({ from: "393331234567", id: "w1", timestamp: "1", type: "audio", audio: { id: "x" } });
    expect(t.whatsapp.inviati[1]!.testo).toBe(
      "Mi scusi, non riesco ad ascoltare i messaggi vocali né a vedere le foto: me lo può scrivere?",
    );
    expect(t.interprete.chiamate).toHaveLength(0);
  });

  it("se l'AI non risponde, il cliente viene passato a un venditore", async () => {
    const t = prepara(undefined, {
      chiamate: [],
      interpreta: async () => {
        throw new Error("API non raggiungibile");
      },
    } as unknown as InterpreteFinto);
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    await t.dalCliente(messaggioTesto("w1", "sui 15000"));
    expect(t.whatsapp.inviati[1]!.testo).toBe(
      "Un nostro venditore la richiamerà su questo numero appena possibile. Buona serata.",
    );
    expect([...t.archivio.leads.values()][0]!.stato).toBe("da_richiamare");
  });

  it("dopo uno STOP il bot non scrive più", async () => {
    const t = prepara();
    await t.nuovoLead({ telefono: "3331234567", canale: "portale", auto: "Fiat Tipo" });
    await t.dalCliente(messaggioTesto("w1", "stop"));
    await t.dalCliente(messaggioTesto("w2", "ciao"));
    expect(t.whatsapp.inviati.map((m) => m.testo)).toHaveLength(2);
    expect(t.archivio.eventi.map((e) => e.evento.tipo)).toEqual(["non_interessato", "messaggio_senza_risposta"]);
  });
});

describe("API dei lead", () => {
  it("rifiuta chi non ha il token", async () => {
    const { app } = prepara();
    const r = await app.request("/api/lead", { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
  });

  it("rifiuta dati non validi", async () => {
    const t = prepara();
    expect((await t.nuovoLead({ telefono: "abc", canale: "portale" })).status).toBe(400);
    expect((await t.nuovoLead({ telefono: "3331234567", canale: "fax" })).status).toBe(400);
    expect((await t.nuovoLead({ telefono: "3331234567", canale: "portale", salone_id: "inesistente" })).status).toBe(400);
  });
});
