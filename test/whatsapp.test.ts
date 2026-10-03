import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizzaTelefono } from "../src/dominio/telefono.js";
import { firmaValida, leggiWebhook } from "../src/whatsapp/whatsapp.js";

/** Un webhook come lo manda Meta. */
export function webhookMeta(messaggi: object[], phoneNumberId = "111", contatti: object[] = []) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "390586000000", phone_number_id: phoneNumberId },
              contacts: contatti,
              messages: messaggi,
            },
          },
        ],
      },
    ],
  };
}

export function messaggioTesto(id: string, testo: string, da = "393331234567") {
  return { from: da, id, timestamp: "1791225000", type: "text", text: { body: testo } };
}

describe("numeri di telefono", () => {
  it.each([
    ["333 123 4567", "+393331234567"],
    ["+39 333-1234567", "+393331234567"],
    ["0039 3331234567", "+393331234567"],
    ["0586 123456", "+390586123456"],
    ["393331234567", "+393331234567"],
    ["+41 79 123 45 67", "+41791234567"],
    ["ciao", null],
    ["123", null],
  ])("%s → %s", (grezzo, atteso) => {
    expect(normalizzaTelefono(grezzo)).toBe(atteso);
  });
});

describe("webhook di Meta", () => {
  it("estrae testo, nome del profilo e numero del salone", () => {
    const corpo = webhookMeta(
      [messaggioTesto("wamid.1", "buonasera")],
      "111",
      [{ wa_id: "393331234567", profile: { name: "Mario" } }],
    );
    expect(leggiWebhook(corpo)).toEqual([
      {
        phoneNumberId: "111",
        da: "393331234567",
        nomeProfilo: "Mario",
        whatsappId: "wamid.1",
        tipo: "testo",
        testo: "buonasera",
        il: new Date(1791225000 * 1000).toISOString(),
      },
    ]);
  });

  it("riconosce vocali, foto con didascalia e risposte ai pulsanti", () => {
    const corpo = webhookMeta([
      { from: "39333", id: "a", timestamp: "1", type: "audio", audio: { id: "x" } },
      { from: "39333", id: "b", timestamp: "1", type: "image", image: { id: "y", caption: "questa è la mia Punto" } },
      { from: "39333", id: "c", timestamp: "1", type: "button", button: { text: "Sì" } },
    ]);
    expect(leggiWebhook(corpo).map((m) => [m.tipo, m.testo])).toEqual([
      ["vocale", null],
      ["testo", "questa è la mia Punto"],
      ["testo", "Sì"],
    ]);
  });

  it("ignora le conferme di consegna e lettura", () => {
    const corpo = {
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, statuses: [{ id: "x", status: "read" }] } }] }],
    };
    expect(leggiWebhook(corpo)).toEqual([]);
    expect(leggiWebhook(null)).toEqual([]);
  });

  it("accetta solo richieste firmate con il segreto dell'app", () => {
    const corpo = '{"a":1}';
    const firma = "sha256=" + createHmac("sha256", "segreto").update(corpo).digest("hex");
    expect(firmaValida(corpo, firma, "segreto")).toBe(true);
    expect(firmaValida(corpo, firma, "altro-segreto")).toBe(false);
    expect(firmaValida('{"a":2}', firma, "segreto")).toBe(false);
    expect(firmaValida(corpo, undefined, "segreto")).toBe(false);
    expect(firmaValida(corpo, "sha256=abc", "segreto")).toBe(false);
  });
});
