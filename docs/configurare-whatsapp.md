# Collegare WhatsApp (demo con il numero di prova di Meta)

Il numero di prova di Meta è gratuito e basta per la demo. Può scrivere al massimo a 5 numeri che registri tu (il tuo e quello del titolare a cui fai la demo).

> I nomi dei menu di Meta cambiano spesso: se qualcosa non torna, cerca la voce più simile.

## 1. Creare l'app su Meta

1. Vai su <https://developers.facebook.com>, accedi e scegli **Crea app**.
2. Tipo di app: **Business**. Collegala al tuo portfolio business (se non ce l'hai, Meta ti fa crearne uno).
3. Nella pagina dell'app aggiungi il prodotto **WhatsApp**.

## 2. Numero di prova e destinatari

In **WhatsApp → Configurazione API** (API Setup) trovi:

- il **numero di prova** e il suo **Phone number ID** → va in `whatsapp_phone_number_id` del salone (o in `DEMO_WHATSAPP_PHONE_NUMBER_ID` senza database);
- un **token temporaneo** (dura 24 ore, va bene per la prima prova) → `WHATSAPP_TOKEN`;
- la sezione **A** (destinatari): aggiungi il tuo numero e quello del titolare. Riceveranno un codice di conferma.

Il **segreto dell'app** è in **Impostazioni app → Di base → Chiave segreta** → `WHATSAPP_APP_SECRET`.

## 3. Mettere online il server

Meta deve poter raggiungere il server con un indirizzo **https** pubblico.

- **Per provare dal tuo computer:** avvia il server (`npm run avvia`) e apri un tunnel, ad esempio con `cloudflared tunnel --url http://localhost:3000`, che ti dà un indirizzo `https://….trycloudflare.com`.
- **Per la demo vera:** pubblica il server su un servizio come Render, Railway o Fly.io (ne sceglieremo uno insieme), con le variabili di `.env.example`.

## 4. Configurare il webhook

In **WhatsApp → Configurazione** (Configuration) → **Webhook**:

1. **URL di callback:** `https://<il-tuo-indirizzo>/webhook/whatsapp`
2. **Token di verifica:** la stessa parola che hai messo in `WHATSAPP_VERIFY_TOKEN`
3. Premi **Verifica e salva**: il server risponde da solo.
4. Nei campi del webhook, attiva **messages**.

## 5. Registrare i template del primo messaggio

Il primo messaggio a un cliente che non ti ha mai scritto deve essere un **template approvato**. Vanno creati in **WhatsApp Manager → Modelli di messaggio**, con:

- **Categoria:** Utility
- **Lingua:** Italiano
- **Nome e testo:** esattamente come nella tabella qui sotto (`{{1}}` e `{{2}}` sono i segnaposto; Meta chiede un esempio: usa "Autosalone Demo" e "Fiat Panda").

| Nome | Testo |
|---|---|
| `primo_contatto_richiesta_auto_giorno` | Buongiorno, sono l'assistente di {{1}}. La ringrazio per la richiesta sulla {{2}}. Mi saprebbe indicare un budget di massima? |
| `primo_contatto_richiesta_auto_sera` | Buonasera, sono l'assistente di {{1}}. La ringrazio per la richiesta sulla {{2}}. Mi saprebbe indicare un budget di massima? |
| `primo_contatto_richiesta_giorno` | Buongiorno, sono l'assistente di {{1}}. La ringrazio per la sua richiesta. Mi dice per quale auto ci aveva cercato? |
| `primo_contatto_richiesta_sera` | Buonasera, sono l'assistente di {{1}}. La ringrazio per la sua richiesta. Mi dice per quale auto ci aveva cercato? |
| `primo_contatto_chiamata_persa_giorno` | Buongiorno, sono l'assistente di {{1}}. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato? |
| `primo_contatto_chiamata_persa_sera` | Buonasera, sono l'assistente di {{1}}. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato? |

Il testo vero sta in `src/motore/primo-contatto.ts`: se lo cambi lì, va cambiato anche su Meta.

## 6. Provare

Crea un lead come farebbe un portale:

```bash
curl -X POST https://<il-tuo-indirizzo>/api/lead \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"salone_id":"00000000-0000-4000-8000-000000000001","telefono":"<il tuo numero>","canale":"portale","fonte":"AutoScout24","nome":"Mario Rossi","auto":"Fiat Panda"}'
```

Ti arriva il primo messaggio su WhatsApp: rispondi come se fossi il cliente.

## Per un salone vero

Al posto del numero di prova si collega il numero del salone (o uno nuovo dedicato) al suo account WhatsApp Business, e si genera un token permanente da **Impostazioni business → Utenti di sistema**. Lo vedremo con il primo cliente.
