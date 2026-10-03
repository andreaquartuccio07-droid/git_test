# Il bot in n8n: i workflow "v2"

| Workflow | Cosa fa | Sostituisce |
|---|---|---|
| **wf01-v2 nuovo lead** | Modulo per inserire un contatto da portale o sito: crea il lead e manda il primo messaggio | wf01-nuovo lead |
| **wf02-v2 risposta cliente** | Risponde ai messaggi dei clienti fino all'appuntamento | wf02-risposta cliente |
| **wf04-v2 chiamate perse** | Quando nessuno risponde al telefono, scrive al cliente su WhatsApp | WF04- chiamate-perse-prova |
| wf03-solleciti | Resta com'è: funziona già con i nuovi workflow | |

I vecchi workflow restano com'erano finché non decidi di passare ai nuovi.

### Primo messaggio (wf01-v2 e wf04-v2)

- Il testo è fisso e identico ai template da registrare su Meta (vedi `docs/configurare-whatsapp.md`).
- Se il cliente ha già una conversazione aperta, **non** gli riscrive da capo: avvisa il venditore nella tabella `eventi`.
- Il codice dei nodi è in `n8n/prepara-lead.js` e `n8n/primo-messaggio.js`, provato da `test/n8n-primo-messaggio.test.ts`.

## wf02-v2 risposta cliente

## Come funziona

| Blocco | Cosa fa |
|---|---|
| 0. Aspetta altri messaggi | Salva il messaggio e aspetta 8 secondi: se il cliente ne manda altri, risponde una volta sola a tutti |
| 1. Ricevi il messaggio | Legge numero e testo del cliente, carica il suo lead, il salone (tabella `saloni`) e l'ultimo messaggio del bot |
| 2. Capisci e decidi | **Capisci messaggio**: l'AI estrae solo i dati (budget, giorno, ora, domande...). **Decidi risposta**: le regole scelgono la risposta tra frasi già scritte |
| 3. Salva | Aggiorna il lead e salva i messaggi (nella stessa tabella di prima, così i solleciti di wf03 continuano a funzionare) |
| 4. Rispondi su WhatsApp | Manda la risposta con Twilio |
| Registra eventi per il venditore | Scrive nella tabella `eventi` appuntamenti fissati, disdette, clienti da richiamare, domande a cui il bot non sa rispondere |

L'AI non scrive mai al cliente: così non inventa prezzi, orari o date.

## Cambiare cosa dice il bot

Apri il nodo **Decidi risposta** e cerca la sezione `FRASI DEL BOT`: ci sono tutte le frasi.
Cambia solo il testo tra virgolette. Orari, indirizzo e documenti per il finanziamento
non sono nel codice: stanno nella tabella `saloni` su Supabase.

Il codice del nodo è anche in `n8n/decidi-risposta.js`, con i test in `test/n8n-decidi.test.ts`.

## Passare ai nuovi workflow

1. In n8n attiva **wf01-v2**, **wf02-v2** e **wf04-v2**.
2. Su Twilio, sandbox WhatsApp ("When a message comes in"): da `.../webhook/twilio-in` a `.../webhook/twilio-in-v2`.
3. Su Twilio, numero di telefono per le chiamate ("A call comes in"): da `.../webhook/twilio-voce` a `.../webhook/twilio-voce-v2`.
4. Disattiva i vecchi wf01, wf02 e WF04.
5. Il modulo per inserire i lead è l'indirizzo "Production URL" del nodo **Nuova richiesta (modulo)** in wf01-v2.

Per tornare indietro basta rimettere gli indirizzi vecchi su Twilio e riattivare i vecchi workflow.

## Cosa resta da fare

- Numero WhatsApp vero e template approvati da Meta al posto della sandbox di Twilio.
- Arrivo automatico dei lead dalle email dei portali (oggi si inseriscono dal modulo).
