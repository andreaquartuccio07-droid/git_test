import { describe, expect, it } from "vitest";
import { saloneDemo } from "../src/config/salone-demo.js";
import { avviaConversazione } from "../src/motore/motore.js";
import { Conversazione, InterpreteFinto, LUNEDI_SERA, nuovoLead } from "./aiuti.js";

describe("primo messaggio", () => {
  it("lead da portale: saluta per cognome, ringrazia per l'auto e chiede il budget", () => {
    const lead = nuovoLead({ nome: "Mario", cognome: "Rossi", genere: "M", autoInteresse: "Ford Fiesta" });
    expect(avviaConversazione(lead, saloneDemo, LUNEDI_SERA)).toBe(
      "Buonasera signor Rossi, sono l'assistente di Autosalone Demo. La ringrazio per la richiesta sulla Ford Fiesta. Mi saprebbe indicare un budget di massima?",
    );
  });

  it("chiamata persa: spiega perché scrive e chiede che auto cercava", () => {
    const lead = nuovoLead({ canale: "chiamata_persa", fonte: null });
    expect(avviaConversazione(lead, saloneDemo, LUNEDI_SERA.set({ hour: 11 }))).toBe(
      "Buongiorno, sono l'assistente di Autosalone Demo. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato?",
    );
  });
});

describe("conversazione completa", () => {
  it("lead da portale fino all'appuntamento confermato", async () => {
    const c = new Conversazione(
      nuovoLead({ nome: "Mario", cognome: "Rossi", genere: "M", autoInteresse: "Ford Fiesta" }),
      new InterpreteFinto({
        "sui 12 mila": { budget: "12000" },
        "a rate": { finanziamento: "si" },
        "no": { permuta: "no" },
        "martedì": { giorno: "2026-10-06" },
        "alle 6": { ora: "18:00" },
      }),
    );
    expect(await c.cliente("sui 12 mila")).toBe(
      "La ringrazio. Pensa di acquistarla con un finanziamento o in un'unica soluzione?",
    );
    expect(await c.cliente("a rate")).toBe("Perfetto, grazie. Ha un usato da dare in permuta?");
    expect(await c.cliente("no")).toBe("La ringrazio. Quando potrebbe passare in salone?");
    expect(await c.cliente("martedì")).toBe("Perfetto, grazie. A che ora preferisce passare martedì 6 ottobre?");
    expect(await c.cliente("alle 6")).toBe(
      "Perfetto signor Rossi, la aspettiamo martedì 6 ottobre alle 18:00. Per la verifica del finanziamento porti un documento d'identità, il codice fiscale e l'ultima busta paga. Se le cambia qualcosa mi scriva qui.",
    );
    expect(c.lead).toMatchObject({
      stato: "appuntamento",
      appuntamento: "2026-10-06T18:00:00.000+02:00",
      budget: "12000",
      finanziamento: true,
      permuta: false,
    });
    expect(c.ultimo.eventi).toEqual([{ tipo: "appuntamento_fissato", quando: "2026-10-06T18:00:00.000+02:00" }]);
  });

  it("chiamata persa: prima di confermare chiede nome e se si può richiamare", async () => {
    const c = new Conversazione(
      nuovoLead({ canale: "chiamata_persa", fonte: null }),
      new InterpreteFinto({
        "una golf, massimo 15000, contanti, niente permuta": {
          auto_cercata: "Volkswagen Golf",
          budget: "15000",
          finanziamento: "no",
          permuta: "no",
        },
        "giovedì alle 10": { giorno: "2026-10-08", ora: "10:00" },
        "Laura Bianchi": { nome: "Laura", cognome: "Bianchi", genere: "F" },
        "sì certo": { richiamabile: "si" },
      }),
    );
    expect(await c.cliente("una golf, massimo 15000, contanti, niente permuta")).toBe(
      "La ringrazio. Quando potrebbe passare in salone?",
    );
    expect(await c.cliente("giovedì alle 10")).toBe(
      "Perfetto, grazie. Per segnare l'appuntamento, mi dice nome e cognome?",
    );
    expect(await c.cliente("Laura Bianchi")).toBe(
      "La ringrazio. Se serve, possiamo richiamarla a questo numero?",
    );
    expect(await c.cliente("sì certo")).toBe(
      "Perfetto signora Bianchi, la aspettiamo giovedì 8 ottobre alle 10:00. Se le cambia qualcosa mi scriva qui.",
    );
    expect(c.lead.richiamabile).toBe(true);
  });
});

describe("domande del cliente", () => {
  it("risponde prima alla domanda, poi chiede il dato che manca, e gira la domanda al venditore", async () => {
    const c = new Conversazione(
      nuovoLead({ autoInteresse: "Fiat Panda" }),
      new InterpreteFinto({
        "quanto costa? fate finanziamenti?": {
          finanziamento: "si",
          domande: [
            { tipo: "prezzo", testo: "quanto costa?" },
            { tipo: "finanziamento", testo: "fate finanziamenti?" },
          ],
        },
      }),
    );
    expect(await c.cliente("quanto costa? fate finanziamenti?")).toBe(
      "Sul prezzo le risponde direttamente il venditore, glielo segnalo. Sì, facciamo finanziamenti: l'approvazione la dà la finanziaria dopo una verifica che il venditore fa in salone. Mi saprebbe indicare un budget di massima?",
    );
    expect(c.lead.domandeInSospeso).toEqual(["quanto costa?"]);
    expect(c.ultimo.eventi).toContainEqual({ tipo: "domanda_per_venditore", testo: "quanto costa?" });
  });

  it("dice gli orari presi dalla configurazione del salone", async () => {
    const c = new Conversazione(
      nuovoLead({ autoInteresse: "Fiat Panda" }),
      new InterpreteFinto({ "a che ora aprite?": { domande: [{ tipo: "orari", testo: "a che ora aprite?" }] } }),
    );
    expect(await c.cliente("a che ora aprite?")).toBe(
      "Siamo aperti dal lunedì al venerdì dalle 9:00 alle 12:30 e dalle 15:00 alle 19:00, il sabato dalle 9:00 alle 12:30. Mi saprebbe indicare un budget di massima?",
    );
  });
});

describe("risposte che non danno il dato", () => {
  it("riformula la domanda, poi passa il cliente a un venditore", async () => {
    const c = new Conversazione(
      nuovoLead({ autoInteresse: "Fiat Panda" }),
      new InterpreteFinto({ "sì": {}, "ok": {} }),
    );
    expect(await c.cliente("sì")).toBe(
      "Mi scusi, mi saprebbe dire una cifra indicativa, anche a grandi linee?",
    );
    expect(await c.cliente("ok")).toBe(
      "Un nostro venditore la richiamerà su questo numero appena possibile. Buona serata.",
    );
    expect(c.lead.stato).toBe("da_richiamare");
    expect(c.ultimo.eventi[0]).toMatchObject({ tipo: "da_richiamare" });
  });

  it("fuori tema: lo dice con garbo e torna alla domanda", async () => {
    const c = new Conversazione(
      nuovoLead({ autoInteresse: "Fiat Panda" }),
      new InterpreteFinto({ "che tempo fa a Livorno?": { intento: "fuori_tema" } }),
    );
    expect(await c.cliente("che tempo fa a Livorno?")).toBe(
      "Su questo purtroppo non posso aiutarla, mi occupo degli appuntamenti in salone. Mi saprebbe indicare un budget di massima?",
    );
  });
});

describe("giorno e ora controllati dal codice", () => {
  const pronto = () =>
    nuovoLead({ nome: "Mario", cognome: "Rossi", genere: "M", autoInteresse: "Fiat Panda", budget: "8000", finanziamento: false, permuta: false });

  it("rifiuta un giorno di chiusura", async () => {
    const c = new Conversazione(pronto(), new InterpreteFinto({ "domenica": { giorno: "2026-10-11" } }));
    expect(await c.cliente("domenica")).toBe("Domenica 11 ottobre siamo chiusi. Le andrebbe bene un altro giorno?");
    expect(c.lead.giornoProposto).toBeNull();
  });

  it("rifiuta un orario fuori dagli orari e ricorda quando si è aperti", async () => {
    const c = new Conversazione(pronto(), new InterpreteFinto({ "sabato alle 16": { giorno: "2026-10-10", ora: "16:00" } }));
    expect(await c.cliente("sabato alle 16")).toBe(
      "Sabato 10 ottobre siamo aperti dalle 9:00 alle 12:30. A che ora preferisce passare?",
    );
    expect(c.lead).toMatchObject({ giornoProposto: "2026-10-10", oraProposta: null });
  });

  it("propone due orari quando il cliente dice da che ora è libero", async () => {
    const c = new Conversazione(
      pronto(),
      new InterpreteFinto({
        "mercoledì, stacco alle 17": { giorno: "2026-10-07", libero_dalle: "17:00" },
        "17:45 va bene": { ora: "17:45" },
      }),
    );
    expect(await c.cliente("mercoledì, stacco alle 17")).toBe(
      "Allora le propongo alle 17:45 o alle 18:00, cosa preferisce?",
    );
    expect(await c.cliente("17:45 va bene")).toBe(
      "Perfetto signor Rossi, la aspettiamo mercoledì 7 ottobre alle 17:45. Se le cambia qualcosa mi scriva qui.",
    );
  });

  it("rifiuta una data oltre il calendario", async () => {
    const c = new Conversazione(pronto(), new InterpreteFinto({ "a dicembre": { giorno: "2026-12-10" } }));
    expect(await c.cliente("a dicembre")).toBe(
      "Per ora fissiamo appuntamenti fino a lunedì 19 ottobre. Quale giorno le andrebbe bene?",
    );
  });
});

describe("dopo l'appuntamento", () => {
  const conAppuntamento = () =>
    nuovoLead({
      nome: "Mario",
      cognome: "Rossi",
      genere: "M",
      autoInteresse: "Fiat Panda",
      budget: "8000",
      finanziamento: false,
      permuta: false,
      appuntamento: "2026-10-06T18:00:00.000+02:00",
      stato: "appuntamento",
    });

  it("disdetta: annulla e chiede un altro giorno", async () => {
    const c = new Conversazione(conAppuntamento(), new InterpreteFinto({ "non riesco a venire": { intento: "disdice_o_sposta" } }));
    expect(await c.cliente("non riesco a venire")).toBe(
      "Nessun problema, annullo l'appuntamento. Quando potrebbe passare in salone?",
    );
    expect(c.lead).toMatchObject({ appuntamento: null, stato: "in_conversazione" });
    expect(c.ultimo.eventi).toContainEqual({ tipo: "appuntamento_annullato" });
  });

  it("spostamento a un altro giorno: tiene l'ora e riconferma", async () => {
    const c = new Conversazione(
      conAppuntamento(),
      new InterpreteFinto({ "posso venire giovedì invece?": { intento: "disdice_o_sposta", giorno: "2026-10-08" } }),
    );
    expect(await c.cliente("posso venire giovedì invece?")).toBe(
      "Perfetto signor Rossi, la aspettiamo giovedì 8 ottobre alle 18:00. Se le cambia qualcosa mi scriva qui.",
    );
  });

  it("risposta ambigua: chiede se l'appuntamento resta valido", async () => {
    const c = new Conversazione(conAppuntamento(), new InterpreteFinto({ "boh vediamo": { intento: "ambiguo" } }));
    expect(await c.cliente("boh vediamo")).toBe(
      "Mi conferma se l'appuntamento di martedì 6 ottobre alle 18:00 resta valido?",
    );
  });

  it("un ringraziamento riceve una conferma breve", async () => {
    const c = new Conversazione(conAppuntamento(), new InterpreteFinto({ "grazie": {} }));
    expect(await c.cliente("grazie")).toBe("Grazie a lei, la aspettiamo martedì 6 ottobre alle 18:00.");
  });
});

describe("quando il bot si ferma", () => {
  it("STOP chiude subito, senza nemmeno chiamare l'AI", async () => {
    const interprete = new InterpreteFinto();
    const c = new Conversazione(nuovoLead(), interprete);
    expect(await c.cliente("STOP")).toBe("Va bene, non la contatteremo più. Buona serata.");
    expect(c.lead.stato).toBe("chiuso");
    expect(interprete.chiamate).toHaveLength(0);
  });

  it("non interessato: chiude e non risponde più", async () => {
    const c = new Conversazione(
      nuovoLead(),
      new InterpreteFinto({ "ho già comprato, grazie": { intento: "non_interessato" } }),
    );
    expect(await c.cliente("ho già comprato, grazie")).toBe("Va bene, non la contatteremo più. Buona serata.");
    expect(await c.cliente("ciao")).toBeNull();
    expect(c.ultimo.eventi).toEqual([{ tipo: "messaggio_senza_risposta", motivo: "chiuso" }]);
  });

  it("se un venditore ha preso la chat, il bot resta zitto", async () => {
    const c = new Conversazione(nuovoLead({ stato: "gestito_da_venditore" }), new InterpreteFinto());
    expect(await c.cliente("buongiorno")).toBeNull();
  });

  it("contatto per un altro motivo: lo passa a un collega", async () => {
    const c = new Conversazione(
      nuovoLead({ canale: "chiamata_persa" }),
      new InterpreteFinto({ "chiamavo per il passaggio di proprietà": { intento: "altro_motivo" } }),
    );
    expect(await c.cliente("chiamavo per il passaggio di proprietà")).toBe(
      "La ringrazio, lo segnalo a un nostro collega che la ricontatterà appena possibile.",
    );
    expect(c.lead.stato).toBe("da_richiamare");
    expect(c.lead.domandeInSospeso).toEqual(["chiamavo per il passaggio di proprietà"]);
  });
});
