# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WhatsApp assistant for used-car dealerships (Italian market): it answers leads from portals, the dealer's website and missed calls, collects budget / payment / trade-in, and books an appointment at the showroom. All code, identifiers, comments, user-facing text and docs are in **Italian** — keep it that way.

The owner is not a programmer. Explanations to them should be plain Italian, without jargon.

## Two implementations of the same bot

1. **n8n workflows (the one in use).** Live on the owner's n8n Cloud instance, backed by the Supabase project "assistente lead". The repo only holds the JavaScript of the n8n Code nodes (`n8n/*.js`) and their tests; the workflows themselves live in n8n. See `n8n/LEGGIMI.md`.
   - `wf01-v2 nuovo lead` (form) and `wf04-v2 chiamate perse` (Twilio voice webhook) share `n8n/prepara-lead.js` and `n8n/primo-messaggio.js`.
   - `wf02-v2 risposta cliente` (Twilio WhatsApp webhook) runs `n8n/decidi-risposta.js` in the node "Decidi risposta".
   - The old workflows (wf01, wf02, WF04) and `wf03-solleciti` still exist; wf03 reads `n8n_chat_histories`, so that table's message format (`{type: 'human'|'ai', content}`) must not change.
   - When a `n8n/*.js` file changes, the same code must be pushed into the matching n8n node (the n8n MCP `update_workflow` with `setNodeParameter` on `/jsCode`). The repo file and the node must stay identical.
2. **TypeScript program (`src/`, kept ready for later).** Same conversation rules, but with Claude as interpreter, Meta WhatsApp Cloud API instead of Twilio, and a multi-tenant Postgres schema (`supabase/migrations/`). Not deployed.

The conversation rules are duplicated: `src/motore/` (TypeScript) and `n8n/decidi-risposta.js` (plain JS for the n8n Code node). A change to the rules usually belongs in both.

## Core design: "the AI understands, the code decides"

The LLM never writes text to the customer. It only extracts structured data from the latest message: intent, budget, financing, trade-in, day, time, "free from", name, questions asked (schema in `src/ai/interpretazione.ts`, and the `inputSchema` of the n8n node "Capisci messaggio"). Deterministic code then:

- picks the next missing field in a fixed order: car → budget → payment → trade-in → day → time → name (→ "can we call you back", for missed calls only) (`prossimoDato`);
- validates days and times against the dealer's opening hours, which come from the salone config or the `saloni` table and are never hard-coded;
- builds the reply only from hand-written sentences (`src/motore/frasi.ts` / the `FRASI DEL BOT` section in `decidi-risposta.js`). Prices, trade-in values, rates and availability are never stated: those questions are routed to the salesperson as events.

Lessons from live tests with gpt-4o-mini, now enforced in code. Don't undo them:

- The extractor sees only the **last bot message plus the new customer message**, not the whole history; otherwise it re-extracts stale data.
- When the customer names a weekday or "oggi/domani", the date is computed by `giornoDalTesto` and the LLM's date is ignored. This only applies when the LLM also returned a day, so that "a domani!" as a goodbye doesn't move the appointment.
- If `libero_dalle` is set ("stacco alle 17"), any `ora` from the LLM is dropped and two slots are proposed.
- Gender falls back to the first name (-o / -a, with exceptions such as Andrea and Luca) when the LLM leaves it null.

The first message to a lead must match a Meta-approved WhatsApp template word for word (`src/motore/primo-contatto.ts`). `test/n8n-primo-messaggio.test.ts` checks that the n8n version produces identical text.

## Commands

```bash
npm install
npm test                                  # vitest, all tests (no AI or network needed)
npx vitest run test/n8n-decidi.test.ts    # one file
npx vitest run -t "chiamata persa"        # tests whose name matches
npm run typecheck                         # tsc --noEmit
npm run simula [-- chiamata_persa]        # chat with the TS bot in the terminal (needs ANTHROPIC_API_KEY)
npm run avvia                             # TS server; config in .env.example
```

- **Postgres archive tests** (`test/postgres.test.ts`) are skipped unless `TEST_DATABASE_URL` points to a throwaway database: they drop and recreate the `public` and `auth` schemas, apply every migration and then `supabase/seed-demo.sql`.
- **Tests run at a fixed time.** They use `LUNEDI_SERA` (Mon 2026-10-05 20:30 Europe/Rome) from `test/aiuti.ts`, so expected dates and greetings are deterministic.
  - TS engine tests pass `adesso` explicitly.
  - n8n node tests set Luxon `Settings.now`.
- **How the n8n node tests run.** They load `n8n/*.js` with `new Function("$", "DateTime", code)` and fake `$('Node name').first().json`. The node names the code references ("Carica lead e salone", "Prepara dati", "Capisci messaggio", "Prepara lead", "Crea o trova lead") must match the real n8n node names.

## TS program layout (the parts that span files)

- `src/servizio/conversazioni.ts` orchestrates incoming messages:
  - saves each message first, deduplicating on `whatsapp_id`;
  - waits `ATTESA_RISPOSTA_SECONDI`, then answers all unprocessed client messages at once;
  - processes one lead at a time through an in-process queue (single instance only);
  - on an LLM failure, sends "un venditore la richiamerà" and moves the lead to `da_richiamare`.
- `src/motore/motore.ts` `gestisciMessaggio` is pure: given lead + history + text + an `Interprete`, it returns the reply, the updated lead and events. Tests use `InterpreteFinto` instead of Claude.
- `src/archivio/` exposes the `Archivio` interface, with in-memory and Postgres implementations. Messages are ordered by insertion id, not by WhatsApp timestamp.
- **Lead states:**
  - `in_conversazione` / `appuntamento`: the bot keeps replying.
  - `da_richiamare` / `gestito_da_venditore` / `chiuso`: the bot stays silent and only records a `messaggio_senza_risposta` event.

## Live Supabase schema (used by n8n)

This is not the same as `supabase/migrations/`.

| Table | What it holds |
|---|---|
| `leads` | bigint ids. Extra columns: `salone_id` (default demo salone `00000000-0000-4000-8000-000000000001`), `cognome`, `genere`, `usato`, `giorno_proposto`, `ora_proposta`, `richiamabile`, `risposte_vuote`, `domande_in_sospeso` |
| `saloni` | Opening hours as jsonb keyed `"1"`–`"7"` |
| `eventi` | Notes for the salesperson |
| `n8n_chat_histories` | Conversation keyed by phone, e.g. `+39…` |

- `leads.canale` holds the portal name, or `chiamata persa` (with a space).
- Deletes on this database need the user's confirmation. For test data, prefer updates over deletes.
- Test leads use fake numbers `+39000000000x`; Twilio cannot deliver to them.
