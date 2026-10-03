/**
 * Simulatore da terminale: si fa finta di essere il cliente e si chatta con il bot.
 *
 *   npm run simula                       lead da portale (Mario Rossi, Ford Fiesta)
 *   npm run simula -- chiamata_persa     cliente che ha chiamato e nessuno ha risposto
 *
 * Serve ANTHROPIC_API_KEY nell'ambiente.
 */
import { DateTime } from "luxon";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { InterpreteClaude } from "../ai/claude.js";
import { saloneDemo } from "../config/salone-demo.js";
import type { Lead, Messaggio } from "../dominio/tipi.js";
import { avviaConversazione, gestisciMessaggio } from "../motore/motore.js";

const canale = process.argv[2] === "chiamata_persa" ? "chiamata_persa" : "portale";
const adesso = () => DateTime.now().setZone(saloneDemo.fusoOrario);

let lead: Lead = {
  id: "simulazione",
  saloneId: saloneDemo.id,
  telefono: "+390000000000",
  canale,
  fonte: canale === "portale" ? "AutoScout24" : null,
  nome: canale === "portale" ? "Mario Rossi" : null,
  cognome: null,
  genere: null,
  autoInteresse: canale === "portale" ? "Ford Fiesta" : null,
  budget: null,
  finanziamento: null,
  permuta: null,
  usato: null,
  giornoProposto: null,
  oraProposta: null,
  appuntamento: null,
  richiamabile: null,
  stato: "in_conversazione",
  risposteVuote: 0,
  domandeInSospeso: [],
  creatoIl: adesso().toISO()!,
  ultimoMessaggioIl: null,
};

const interprete = new InterpreteClaude();
const storico: Messaggio[] = [];
const rl = createInterface({ input: stdin, output: stdout });

const primo = avviaConversazione(lead, saloneDemo, adesso()).testo;
storico.push({ autore: "bot", testo: primo, il: adesso().toISO()! });
console.log(`\nBOT: ${primo}\n`);

for (;;) {
  const testo = (await rl.question("TU:  ")).trim();
  if (!testo) continue;
  if (testo === "/esci") break;
  if (testo === "/lead") {
    console.log(lead);
    continue;
  }
  const esito = await gestisciMessaggio({ salone: saloneDemo, lead, storico, testo, adesso: adesso() }, interprete);
  storico.push({ autore: "cliente", testo, il: adesso().toISO()! });
  lead = esito.lead;
  if (esito.risposta) {
    storico.push({ autore: "bot", testo: esito.risposta, il: adesso().toISO()! });
    console.log(`\nBOT: ${esito.risposta}`);
  } else {
    console.log("\n(il bot non risponde)");
  }
  for (const e of esito.eventi) console.log(`     [per il venditore] ${JSON.stringify(e)}`);
  console.log();
}
rl.close();
