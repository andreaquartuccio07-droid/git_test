# Assistente WhatsApp per autosaloni

Risponde su WhatsApp, anche la sera e la domenica, ai clienti che arrivano dai portali (AutoScout24, Subito, Automobile.it…), dal sito del salone e dalle chiamate perse. Raccoglie budget, pagamento e permuta, poi fissa l'appuntamento in salone e avvisa il venditore.

## Come è fatto

Il punto chiave: **l'AI capisce, il codice decide.**

```
messaggio del cliente
      │
      ▼
 Claude interpreta  ──►  dati strutturati: budget, finanziamento, permuta,
 (src/ai/claude.ts)      giorno, ora, domande fatte, intento (disdice, stop…)
      │
      ▼
 il motore decide  ──►  controlla date e orari del salone, sceglie il prossimo
 (src/motore/)           dato da chiedere, compone la risposta da frasi scritte a mano
      │
      ▼
 risposta + eventi per il venditore (appuntamento fissato, da richiamare, domande)
```

Così il bot **non inventa mai** prezzi, disponibilità, orari o date: ogni frase che può scrivere sta in `src/motore/frasi.ts`. Le regole (ordine dei dati, orari, cosa fare se il cliente non risponde) sono codice coperto da test, non istruzioni in un prompt che l'AI può ignorare.

### Cartelle

| Percorso | Cosa contiene |
|---|---|
| `src/dominio/` | Tipi (salone, lead, messaggi) e calendario: orari di apertura, verifica degli appuntamenti, proposte di orario |
| `src/motore/` | Il flusso della conversazione e tutte le frasi del bot |
| `src/ai/` | L'interprete: cosa deve ricavare l'AI da un messaggio, e l'implementazione con Claude |
| `src/config/` | La configurazione del salone demo |
| `src/cli/simula.ts` | Simulatore da terminale per chattare con il bot |
| `supabase/migrations/` | Lo schema del database con i dati separati per salone |
| `test/` | Conversazioni intere simulate, eseguite a ogni modifica |

### Più saloni, dati separati

Ogni lead, messaggio ed evento porta il `salone_id`. Le regole di sicurezza del database (RLS) fanno vedere a ogni utente del pannello solo i dati del proprio salone: il blocco è nel database, non solo nel pannello.

## Provarlo

Serve Node.js 20 o più recente.

```bash
npm install
npm test                                   # i test, senza AI
export ANTHROPIC_API_KEY=...               # chiave da console.anthropic.com
npm run simula                             # lead da portale
npm run simula -- chiamata_persa           # cliente che ha chiamato senza risposta
```

Nel simulatore scrivi come se fossi il cliente. `/lead` mostra i dati raccolti, `/esci` chiude.

## Stato dei lavori

- [x] Motore della conversazione con le regole del salone
- [x] Interpretazione dei messaggi con Claude
- [x] Schema del database con più saloni separati
- [ ] Server: ricezione messaggi WhatsApp (Cloud API di Meta) e invio risposte
- [ ] Arrivo dei lead: email dei portali, modulo del sito, chiamate perse
- [ ] Solleciti ai clienti che non rispondono (con template WhatsApp)
- [ ] Pannello per il salone: lead, chat, appuntamenti, presa in carico del venditore
- [ ] Notifiche al venditore
