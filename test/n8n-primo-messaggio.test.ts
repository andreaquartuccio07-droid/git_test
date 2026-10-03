import { readFileSync } from "node:fs";
import { DateTime, Settings } from "luxon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saloneDemo } from "../src/config/salone-demo.js";
import { primoContatto } from "../src/motore/primo-contatto.js";
import { LUNEDI_SERA, nuovoLead } from "./aiuti.js";

/** Prova i nodi n8n "Prepara lead" e "Primo messaggio" (cartella n8n/). */
const prepara = new Function("$input", readFileSync("n8n/prepara-lead.js", "utf8")) as (
  input: { first: () => { json: unknown } },
) => [{ json: Record<string, string> }];
const primo = new Function("$", "DateTime", readFileSync("n8n/primo-messaggio.js", "utf8")) as (
  $: (nome: string) => { first: () => { json: unknown } },
  dt: typeof DateTime,
) => [{ json: { template: string; parametri: string[]; testo: string } }];

const saloneDb = { nome: "Autosalone Demo", fuso_orario: "Europe/Rome", ora_sera: 17 };
const preparaLead = (dati: object) => prepara({ first: () => ({ json: dati }) })[0].json;
const primoMessaggio = (lead: object) =>
  primo((nome) => ({ first: () => ({ json: nome === "Prepara lead" ? lead : { salone: saloneDb } }) }), DateTime)[0].json;

describe("nodo n8n Prepara lead", () => {
  it("sistema numero, nome e auto", () => {
    expect(preparaLead({ telefono: "333 123 4567", nome: "mario rossi", canale: "Subito.it", auto_interesse: "ford fiesta" })).toEqual({
      telefono: "+393331234567", nome: "Mario Rossi", canale: "Subito.it", auto: "Ford Fiesta",
    });
    expect(preparaLead({ From: "+393331234567", canale: "chiamata persa" })).toMatchObject({ telefono: "+393331234567", auto: "" });
    expect(preparaLead({ telefono: "0039 333 1234567", auto: "BMW X1" }).auto).toBe("BMW X1");
    expect(preparaLead({ telefono: "3331234567", auto: "volkswagen golf del 2019" }).auto).toBe("Volkswagen Golf del 2019");
  });

  it("si ferma se il numero non è valido", () => {
    expect(() => preparaLead({ telefono: "ciao" })).toThrow(/non valido/);
  });
});

describe("nodo n8n Primo messaggio", () => {
  beforeAll(() => {
    Settings.now = () => LUNEDI_SERA.toMillis();
  });
  afterAll(() => {
    Settings.now = () => Date.now();
  });

  // Il testo deve essere identico ai template definiti nel programma (src/motore/primo-contatto.ts).
  it.each([
    [{ canale: "Subito.it", auto: "Fiat 500" }, nuovoLead({ canale: "portale", autoInteresse: "Fiat 500" })],
    [{ canale: "sito", auto: "" }, nuovoLead({ canale: "sito" })],
    [{ canale: "chiamata persa", auto: "" }, nuovoLead({ canale: "chiamata_persa" })],
  ])("%o usa lo stesso template del programma", (leadN8n, lead) => {
    const atteso = primoContatto(lead, saloneDemo, LUNEDI_SERA);
    expect(primoMessaggio(leadN8n)).toEqual({ template: atteso.nome, parametri: atteso.parametri, testo: atteso.testo });
  });
});
