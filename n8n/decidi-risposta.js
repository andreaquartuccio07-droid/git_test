// ===========================================================================
// DECIDI RISPOSTA
// L'AI (nodo "Capisci messaggio") ha già estratto i dati dal messaggio del
// cliente. Qui si decide cosa rispondere, con regole fisse e frasi scritte a
// mano: il bot non inventa prezzi, orari o date.
//
// Per cambiare cosa dice il bot: modifica le frasi nella sezione FRASI.
// ===========================================================================

const dati = $('Carica lead e salone').first().json;
const testo = $('Prepara dati').first().json.testo;
const it = $('Capisci messaggio').first().json.output;

// ---------------------------------------------------------------------------
// CALENDARIO E ORARI DEL SALONE
// ---------------------------------------------------------------------------
const salone = dati.salone;
const ZONA = salone.fuso_orario || 'Europe/Rome';
const adesso = DateTime.now().setZone(ZONA);
const GIORNI_PRENOTABILI = 14;
const MINUTI_PRIMA_DELLA_CHIUSURA = 30;
const MINUTI_PREAVVISO_OGGI = 60;
const NOMI_GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

const minuti = (ora) => { const [h, m] = ora.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const daMinuti = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
const oraLeggibile = (ora) => ora.replace(/^0(\d)/, '$1');
const giorno = (data) => DateTime.fromISO(data, { zone: ZONA }).setLocale('it');
const etichetta = (data) => giorno(data).toFormat('cccc d LLLL');
const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fasceDelGiorno = (data) =>
  (salone.chiusure || []).includes(data) ? [] : (salone.orari[String(giorno(data).weekday)] || []);
const descriviOrari = (fasce) =>
  fasce.map((f) => `dalle ${oraLeggibile(f.da)} alle ${oraLeggibile(f.a)}`).join(' e ');

const calendario = [];
for (let i = 0; i <= GIORNI_PRENOTABILI; i++) {
  const data = adesso.startOf('day').plus({ days: i }).toISODate();
  calendario.push({ data, oggi: i === 0, aperto: fasceDelGiorno(data).length > 0 });
}

function verificaOrario(data, ora) {
  const g = calendario.find((x) => x.data === data);
  if (!g) return 'fuori_calendario';
  const fasce = fasceDelGiorno(data);
  if (fasce.length === 0) return 'giorno_chiuso';
  const m = minuti(ora);
  if (!fasce.some((f) => m >= minuti(f.da) && m <= minuti(f.a) - MINUTI_PRIMA_DELLA_CHIUSURA)) return 'fuori_orario';
  if (g.oggi && m < adesso.hour * 60 + adesso.minute + MINUTI_PREAVVISO_OGGI) return 'troppo_presto';
  return 'ok';
}

function proponiOrari(data, liberoDalle) {
  const proposte = [];
  for (let m = Math.ceil((minuti(liberoDalle) + 45) / 15) * 15; m < 24 * 60 && proposte.length < 2; m += 15) {
    if (verificaOrario(data, daMinuti(m)) === 'ok') proposte.push(daMinuti(m));
  }
  return proposte;
}

function descriviSettimana() {
  const gruppi = [];
  for (let g = 1; g <= 7; g++) {
    const fasce = salone.orari[String(g)] || [];
    if (fasce.length === 0) continue;
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.a === g - 1 && JSON.stringify(ultimo.fasce) === JSON.stringify(fasce)) ultimo.a = g;
    else gruppi.push({ da: g, a: g, fasce });
  }
  return gruppi
    .map((x) => (x.da === x.a ? `il ${NOMI_GIORNI[x.da]}` : `dal ${NOMI_GIORNI[x.da]} al ${NOMI_GIORNI[x.a]}`) + ' ' + descriviOrari(x.fasce))
    .join(', ');
}

const sera = adesso.hour >= (salone.ora_sera || 17);
const congedo = sera ? 'Buona serata' : 'Buona giornata';

// ---------------------------------------------------------------------------
// FRASI DEL BOT
// ---------------------------------------------------------------------------
const lead = {
  nome: dati.nome || null,
  cognome: dati.cognome || null,
  genere: dati.genere || null,
  auto_interesse: dati.auto_interesse || null,
  budget: dati.budget || null,
  finanziamento: dati.finanziamento ?? null,
  permuta: dati.permuta ?? null,
  usato: dati.usato || null,
  giorno_proposto: dati.giorno_proposto || null,
  ora_proposta: dati.ora_proposta || null,
  data_appuntamento: dati.data_appuntamento || null,
  richiamabile: dati.richiamabile ?? null,
  stato: dati.stato || 'in_conversazione',
  risposte_vuote: Number(dati.risposte_vuote || 0),
  domande_in_sospeso: [...(dati.domande_in_sospeso || [])],
};
const chiamataPersa = dati.canale === 'chiamata persa';

const DOMANDE = {
  auto: () => 'Mi dice per quale auto ci aveva cercato?',
  budget: () => 'Mi saprebbe indicare un budget di massima?',
  pagamento: () => "Pensa di acquistarla con un finanziamento o in un'unica soluzione?",
  permuta: () => 'Ha un usato da dare in permuta?',
  giorno: () => 'Quando potrebbe passare in salone?',
  ora: () => `A che ora preferisce passare ${etichetta(lead.giorno_proposto)}?`,
  nome: () => "Per segnare l'appuntamento, mi dice nome e cognome?",
  richiamabile: () => 'Se serve, possiamo richiamarla a questo numero?',
};

// La stessa domanda più semplice, quando il cliente non ha dato il dato richiesto.
const DOMANDE_RIFORMULATE = {
  auto: () => "Mi scusi, sta cercando un'auto in particolare?",
  budget: () => 'Mi scusi, mi saprebbe dire una cifra indicativa, anche a grandi linee?',
  pagamento: () => 'Mi scusi, intende con un finanziamento?',
  permuta: () => "Mi scusi, ha un'auto sua da dare in permuta?",
  giorno: () => 'Mi scusi, mi dice un giorno in cui potrebbe passare?',
  ora: () => `Mi scusi, mi indica un orario? ${maiuscola(etichetta(lead.giorno_proposto))} siamo aperti ${descriviOrari(fasceDelGiorno(lead.giorno_proposto))}.`,
  nome: () => "Mi scusi, mi dice il suo nome e cognome per l'appuntamento?",
  richiamabile: () => 'Mi scusi, se serve possiamo richiamarla a questo numero?',
};

// Risposte alle domande del cliente. Mai prezzi, valutazioni o promesse.
const RISPOSTE = {
  prezzo: () => 'Sul prezzo le risponde direttamente il venditore, glielo segnalo.',
  valutazione_usato: () => "L'usato lo valuta il venditore di persona qui in salone, dopo averlo visto.",
  finanziamento: () => salone.finanziamenti
    ? "Sì, facciamo finanziamenti: l'approvazione la dà la finanziaria dopo una verifica che il venditore fa in salone."
    : "Non facciamo finanziamenti, il pagamento è in un'unica soluzione.",
  disponibilita_auto: () => 'Verifico con il venditore che sia ancora disponibile e le faccio sapere.',
  orari: () => `Siamo aperti ${descriviSettimana()}.`,
  indirizzo: () => `Ci trova in ${salone.indirizzo}.`,
  altro: () => 'Verifico con il venditore e le faccio sapere.',
};
// Queste domande finiscono anche nella lista del venditore.
const DOMANDE_PER_IL_VENDITORE = ['prezzo', 'disponibilita_auto', 'altro'];

const FRASI = {
  presentazione: `${sera ? 'Buonasera' : 'Buongiorno'}, sono l'assistente di ${salone.nome}.`,
  stop: `Va bene, non la contatteremo più. ${congedo}.`,
  richiamo: `Un nostro venditore la richiamerà su questo numero appena possibile. ${congedo}.`,
  vuoleUnaPersona: 'Mi scusi, le faccio richiamare da un nostro venditore appena possibile.',
  altroMotivo: 'La ringrazio, lo segnalo a un nostro collega che la ricontatterà appena possibile.',
  fuoriTema: 'Su questo purtroppo non posso aiutarla, mi occupo degli appuntamenti in salone.',
  annullato: "Nessun problema, annullo l'appuntamento.",
  riferisco: 'La ringrazio, lo riferisco al venditore.',
  troppoPresto: "Per oggi ci serve almeno un'ora di preavviso. A che ora preferisce passare?",
  chiediConferma: (data, ora) => `Mi conferma se l'appuntamento di ${etichetta(data)} alle ${oraLeggibile(ora)} resta valido?`,
  aspettiamo: (data, ora) => `Grazie a lei, la aspettiamo ${etichetta(data)} alle ${oraLeggibile(ora)}.`,
  giornoChiuso: (data) => `${maiuscola(etichetta(data))} siamo chiusi. Le andrebbe bene un altro giorno?`,
  fuoriCalendario: () => `Per ora fissiamo appuntamenti fino a ${etichetta(calendario[calendario.length - 1].data)}. Quale giorno le andrebbe bene?`,
  fuoriOrario: (data) => `${maiuscola(etichetta(data))} siamo aperti ${descriviOrari(fasceDelGiorno(data))}. A che ora preferisce passare?`,
  nessunOrario: (data) => `${maiuscola(etichetta(data))} a quell'ora siamo già chiusi. Le andrebbe bene un altro giorno?`,
  proposta: (o) => o.length === 1
    ? `Le andrebbe bene alle ${oraLeggibile(o[0])}?`
    : `Allora le propongo alle ${oraLeggibile(o[0])} o alle ${oraLeggibile(o[1])}, cosa preferisce?`,
};

const RINGRAZIAMENTI = ['La ringrazio.', 'Perfetto, grazie.', 'Bene, grazie.'];
function ringraziamento() {
  const primaParola = (s) => s.trim().split(/[\s,.]+/)[0].toLowerCase();
  const precedente = dati.ultimo_bot ? primaParola(dati.ultimo_bot) : null;
  return RINGRAZIAMENTI.find((r) => primaParola(r) !== precedente) || RINGRAZIAMENTI[0];
}

function titolo() {
  if (!lead.cognome || !lead.genere) return null;
  return `${lead.genere === 'F' ? 'signora' : 'signor'} ${lead.cognome}`;
}

function conferma(data, ora) {
  const t = titolo();
  const parti = [`Perfetto${t ? ' ' + t : ''}, la aspettiamo ${etichetta(data)} alle ${oraLeggibile(ora)}.`];
  if (lead.finanziamento === true && salone.finanziamenti) {
    parti.push(`Per la verifica del finanziamento porti ${salone.documenti_finanziamento}.`);
  }
  parti.push('Se le cambia qualcosa mi scriva qui.');
  return parti.join(' ');
}

// ---------------------------------------------------------------------------
// REGOLE DELLA CONVERSAZIONE
// ---------------------------------------------------------------------------

// Il primo dato che manca, nell'ordine in cui va chiesto.
function prossimoDato() {
  if (lead.data_appuntamento) return null;
  if (!lead.auto_interesse) return 'auto';
  if (!lead.budget) return 'budget';
  if (salone.finanziamenti && lead.finanziamento === null) return 'pagamento';
  if (lead.permuta === null) return 'permuta';
  if (!lead.giorno_proposto) return 'giorno';
  if (!lead.ora_proposta) return 'ora';
  if (!lead.nome && !lead.cognome) return 'nome';
  if (chiamataPersa && lead.richiamabile === null) return 'richiamabile';
  return null;
}

// "oggi", "domani", "dopodomani" o un giorno della settimana scritto dal cliente.
// "martedì" è il primo martedì da domani; "martedì prossimo" o "l'altro" il secondo.
// Restituisce null se il cliente non nomina un giorno o ne nomina più di uno.
function giornoDalTesto(t) {
  const s = String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\bdopodomani\b/.test(s)) return calendario[2].data;
  if (/\bdomani\b/.test(s)) return calendario[1].data;
  if (/\boggi\b/.test(s)) return calendario[0].data;
  const nomi = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
  const trovati = nomi.filter((n) => new RegExp(`\\b${n}\\b`).test(s));
  if (trovati.length !== 1) return null;
  const wd = nomi.indexOf(trovati[0]) + 1;
  const giorni = calendario.slice(1).filter((g) => giorno(g.data).weekday === wd);
  const settimanaDopo = /prossim|l'altro|settimana dopo|non questo/.test(s);
  return (settimanaDopo ? giorni[1] : giorni[0])?.data ?? null;
}

function dataEOra(iso) {
  const d = DateTime.fromISO(iso, { zone: ZONA });
  return [d.toISODate(), d.toFormat('HH:mm')];
}

const eventi = [];

function decidi() {
  // Se la chat è passata a una persona o il cliente non vuole più messaggi, il bot tace.
  if (['da_richiamare', 'gestito_da_venditore', 'chiuso'].includes(lead.stato)) {
    eventi.push({ tipo: 'messaggio_senza_risposta', motivo: lead.stato });
    return null;
  }

  const chiudi = () => {
    if (lead.data_appuntamento) eventi.push({ tipo: 'appuntamento_annullato' });
    lead.stato = 'chiuso';
    lead.data_appuntamento = null;
    eventi.push({ tipo: 'non_interessato' });
    return FRASI.stop;
  };
  const daRichiamare = (motivo, risposta) => {
    lead.stato = 'da_richiamare';
    eventi.push({ tipo: 'da_richiamare', motivo });
    return risposta;
  };

  if (/^\s*(stop|basta|cancellami|cancellatemi|non scrivetemi più)\s*[.!]*\s*$/i.test(testo)) return chiudi();
  if (it.intento === 'non_interessato') return chiudi();
  if (it.intento === 'vuole_una_persona') return daRichiamare('il cliente vuole parlare con una persona', FRASI.vuoleUnaPersona);
  if (it.intento === 'altro_motivo') {
    lead.domande_in_sospeso.push(testo);
    return daRichiamare(`contatto per un altro motivo: "${testo}"`, FRASI.altroMotivo);
  }

  const parti = [];
  const domande = Array.isArray(it.domande) ? it.domande : [];

  // 1. Prima si risponde alle domande del cliente.
  const visti = new Set();
  for (const d of domande) {
    if (!RISPOSTE[d.tipo] || visti.has(d.tipo)) continue;
    visti.add(d.tipo);
    parti.push(RISPOSTE[d.tipo]());
    if (DOMANDE_PER_IL_VENDITORE.includes(d.tipo)) {
      lead.domande_in_sospeso.push(d.testo);
      eventi.push({ tipo: 'domanda_per_venditore', testo: d.testo });
    }
  }

  // 2. Disdetta. Se nello stesso messaggio propone già un altro giorno o orario, è uno spostamento (punto 4).
  let annullato = false;
  const proponeAltro = Boolean(it.giorno || it.ora || it.libero_dalle);
  if (it.intento === 'disdice_o_sposta' && !proponeAltro &&
      (lead.data_appuntamento || lead.giorno_proposto || lead.ora_proposta)) {
    if (lead.data_appuntamento) eventi.push({ tipo: 'appuntamento_annullato' });
    lead.data_appuntamento = null;
    lead.giorno_proposto = null;
    lead.ora_proposta = null;
    lead.stato = 'in_conversazione';
    annullato = true;
  }

  // 3. I dati detti dal cliente. Vale sempre l'ultima cosa detta.
  const prima = JSON.stringify(lead);
  const siNo = (v, attuale) => (v === 'si' ? true : v === 'no' ? false : attuale);
  if (it.auto_cercata) lead.auto_interesse = it.auto_cercata;
  if (it.budget) lead.budget = it.budget;
  lead.finanziamento = siNo(it.finanziamento, lead.finanziamento);
  lead.permuta = siNo(it.permuta, lead.permuta);
  if (it.usato) { lead.usato = it.usato; lead.permuta = true; }
  if (it.nome) lead.nome = it.nome;
  if (it.cognome) lead.cognome = it.cognome;
  if (it.genere === 'M' || it.genere === 'F') lead.genere = it.genere;
  lead.richiamabile = siNo(it.richiamabile, lead.richiamabile);
  // Se l'AI non ha indicato il genere, si prova dal nome (-o maschile, -a femminile).
  if (!lead.genere && lead.nome) {
    const n = lead.nome.trim().split(/\s+/)[0].toLowerCase();
    const maschiInA = ['andrea', 'luca', 'nicola', 'mattia', 'elia', 'enea', 'tobia', 'gianluca', 'battista', 'zaccaria'];
    if (/a$/.test(n) && !maschiInA.includes(n)) lead.genere = 'F';
    else if (/o$/.test(n) || maschiInA.includes(n)) lead.genere = 'M';
  }

  // 4. Giorno e ora: li controllano queste regole, non l'AI.
  // Se il cliente propone un giorno ("giovedì", "domani", "martedì prossimo"), la data
  // la calcola il codice: l'AI a volte sbaglia il giorno della settimana. Si corregge
  // solo se anche l'AI ha capito che c'è una data: "a domani!" come saluto non sposta niente.
  if (it.giorno) it.giorno = giornoDalTesto(testo) || it.giorno;
  // Se il cliente ha detto solo da che ora è libero ("stacco alle 17"), l'orario lo
  // sceglie lui tra due proposte: un orario indicato dall'AI qui non vale.
  if (it.libero_dalle) it.ora = null;
  let problema = null;
  if (it.giorno || it.ora || it.libero_dalle) {
    if (lead.data_appuntamento && (it.giorno || it.ora)) {
      const [d, o] = dataEOra(lead.data_appuntamento);
      lead.giorno_proposto = d;
      lead.ora_proposta = o;
      lead.data_appuntamento = null;
      lead.stato = 'in_conversazione';
      eventi.push({ tipo: 'appuntamento_annullato' });
    }
    if (it.giorno) {
      const g = calendario.find((x) => x.data === it.giorno);
      if (!g) problema = FRASI.fuoriCalendario();
      else if (!g.aperto) { lead.giorno_proposto = null; problema = FRASI.giornoChiuso(g.data); }
      else lead.giorno_proposto = g.data;
    }
    if (!problema && it.ora) lead.ora_proposta = it.ora;
    if (!problema && lead.giorno_proposto && lead.ora_proposta) {
      const esito = verificaOrario(lead.giorno_proposto, lead.ora_proposta);
      if (esito !== 'ok') {
        lead.ora_proposta = null;
        problema = esito === 'troppo_presto' ? FRASI.troppoPresto : FRASI.fuoriOrario(lead.giorno_proposto);
      }
    }
    if (!problema && it.libero_dalle && lead.giorno_proposto && !lead.ora_proposta) {
      const proposte = proponiOrari(lead.giorno_proposto, it.libero_dalle);
      if (proposte.length === 0) { problema = FRASI.nessunOrario(lead.giorno_proposto); lead.giorno_proposto = null; }
      else problema = FRASI.proposta(proposte);
    }
  }
  const nuoviDati = JSON.stringify(lead) !== prima;

  if (annullato && !problema && !lead.giorno_proposto) parti.push(FRASI.annullato);
  if (problema) {
    lead.risposte_vuote = 0;
    parti.push(problema);
    return parti.join(' ');
  }

  const dato = prossimoDato();

  // 5a. Appuntamento già fissato.
  if (dato === null && lead.data_appuntamento) {
    const [d, o] = dataEOra(lead.data_appuntamento);
    if (it.intento === 'ambiguo') parti.push(FRASI.chiediConferma(d, o));
    else if (nuoviDati) parti.push(FRASI.riferisco);
    else if (parti.length === 0) parti.push(FRASI.aspettiamo(d, o));
    return parti.join(' ');
  }

  // 5b. Abbiamo tutto: si conferma l'appuntamento.
  if (dato === null) {
    const d = lead.giorno_proposto;
    const o = lead.ora_proposta;
    lead.data_appuntamento = DateTime.fromISO(`${d}T${o}`, { zone: ZONA }).toISO();
    lead.giorno_proposto = null;
    lead.ora_proposta = null;
    lead.stato = 'appuntamento';
    lead.risposte_vuote = 0;
    eventi.push({ tipo: 'appuntamento_fissato', quando: lead.data_appuntamento });
    parti.push(conferma(d, o));
    return parti.join(' ');
  }

  // 5c. Manca ancora qualcosa: si chiede il primo dato che manca.
  if (nuoviDati || domande.length > 0 || annullato) {
    lead.risposte_vuote = 0;
    if (nuoviDati && domande.length === 0 && !annullato) parti.push(ringraziamento());
    parti.push(DOMANDE[dato]());
    return parti.join(' ');
  }

  // Risposta che non dà il dato: si riformula una volta, poi passa a un venditore.
  lead.risposte_vuote += 1;
  if (lead.risposte_vuote >= 2) {
    lead.stato = 'da_richiamare';
    eventi.push({ tipo: 'da_richiamare', motivo: 'il cliente non ha dato risposte utili' });
    return FRASI.richiamo;
  }
  if (it.intento === 'fuori_tema') parti.push(FRASI.fuoriTema, DOMANDE[dato]());
  else parti.push(DOMANDE_RIFORMULATE[dato]());
  return parti.join(' ');
}

let risposta = decidi();
// Se è il cliente a scrivere per primo, il bot si presenta.
if (risposta && !dati.ultimo_bot && lead.stato !== 'chiuso') risposta = `${FRASI.presentazione} ${risposta}`;

return [{ json: { risposta, lead, eventi } }];
