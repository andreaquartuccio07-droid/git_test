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
| `src/servizio/` | Collega WhatsApp, archivio e motore: crea i lead, riceve i messaggi, risponde |
| `src/whatsapp/` | WhatsApp Cloud API di Meta: lettura dei webhook, verifica della firma, invio |
| `src/archivio/` | Dove si salvano lead e messaggi: Postgres (Supabase) o in memoria |
| `src/server/` | Il server HTTP: webhook di WhatsApp e API per creare i lead |
| `src/cli/simula.ts` | Simulatore da terminale per chattare con il bot |
| `supabase/migrations/` | Lo schema del database con i dati separati per salone |
| `docs/configurare-whatsapp.md` | Come collegare WhatsApp per la demo |
| `test/` | Conversazioni intere simulate, eseguite a ogni modifica |

### Più saloni, dati separati

Ogni lead, messaggio ed evento porta il `salone_id`. Le regole di sicurezza del database (RLS) fanno vedere a ogni utente del pannello solo i dati del proprio salone: il blocco è nel database, non solo nel pannello.

## Provarlo

Serve Node.js 20 o più recente.

```bash
npm install
npm test                                   # i test, senza AI né WhatsApp
```

I test dell'archivio su Postgres girano solo se indichi un database usa e getta (viene svuotato): `TEST_DATABASE_URL=postgresql://... npm test`.

**Chattare col bot da terminale** (serve solo la chiave di Claude):

```bash
export ANTHROPIC_API_KEY=...               # chiave da console.anthropic.com
npm run simula                             # lead da portale
npm run simula -- chiamata_persa           # cliente che ha chiamato senza risposta
```

Nel simulatore scrivi come se fossi il cliente. `/lead` mostra i dati raccolti, `/esci` chiude.

**Il server** (configurazione in `.env.example`, collegamento a WhatsApp in `docs/configurare-whatsapp.md`):

```bash
npm run avvia
```

Senza `WHATSAPP_TOKEN` i messaggi vengono scritti a terminale invece che spediti; senza `DATABASE_URL` i dati restano in memoria.

| Indirizzo | A cosa serve |
|---|---|
| `GET /webhook/whatsapp` | Verifica del webhook da parte di Meta |
| `POST /webhook/whatsapp` | Messaggi dei clienti (solo con la firma di Meta) |
| `POST /api/lead` | Nuovo lead da portale, sito o chiamata persa (con `ADMIN_TOKEN`) |
| `GET /salute` | Controllo che il server sia acceso |

### Come gestisce i messaggi

- **Messaggi a raffica:** aspetta qualche secondo (`ATTESA_RISPOSTA_SECONDI`), legge tutti i messaggi arrivati e risponde una volta sola.
- **Doppioni:** Meta a volte manda due volte lo stesso messaggio: il secondo viene scartato.
- **Vocali e foto:** chiede gentilmente di scrivere.
- **Se l'AI non risponde:** il cliente riceve "Un nostro venditore la richiamerà" e il lead passa a una persona.
- **Primo messaggio:** è sempre un template approvato da Meta, come richiede WhatsApp.

## Stato dei lavori

- [x] Motore della conversazione con le regole del salone
- [x] Interpretazione dei messaggi con Claude
- [x] Schema del database con più saloni separati
- [x] Server: ricezione messaggi WhatsApp (Cloud API di Meta) e invio risposte
- [ ] Arrivo dei lead: email dei portali, modulo del sito, chiamate perse
- [ ] Solleciti ai clienti che non rispondono (con template WhatsApp)
- [ ] Pannello per il salone: lead, chat, appuntamenti, presa in carico del venditore
- [ ] Notifiche al venditore
