# Il bot in n8n: workflow "wf02-v2 risposta cliente"

È la nuova versione del workflow che risponde ai clienti su WhatsApp.
Il vecchio **wf02-risposta cliente** resta com'è finché non decidi di passare a questa.

## Come funziona

| Blocco | Cosa fa |
|---|---|
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

## Passare dal vecchio al nuovo workflow

1. In n8n apri **wf02-v2 risposta cliente** e attivalo (Publish/Active).
2. Su Twilio (Messaging → Try it out → WhatsApp sandbox settings) cambia l'indirizzo
   "When a message comes in" da `.../webhook/twilio-in` a `.../webhook/twilio-in-v2`.
3. Disattiva il vecchio **wf02-risposta cliente**.

Per tornare indietro basta rimettere l'indirizzo vecchio su Twilio.

## Cosa resta da fare

- Il primo messaggio (wf01) e le chiamate perse (wf04) usano ancora il vecchio sistema: vanno allineati.
- Messaggi a raffica: se il cliente manda 3 messaggi di fila, il bot risponde 3 volte.
- Numero WhatsApp vero e template approvati da Meta al posto della sandbox di Twilio.
