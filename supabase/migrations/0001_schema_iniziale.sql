-- Schema dell'assistente per autosaloni.
-- Ogni riga di lead, messaggi ed eventi appartiene a un salone (salone_id).
-- Le regole RLS fanno sì che ogni utente veda SOLO i dati del proprio salone:
-- il blocco è nel database, non nel codice del pannello.
-- Il backend usa la chiave service_role e scrive per conto di tutti i saloni.

create table saloni (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  citta text not null,
  indirizzo text not null,
  fuso_orario text not null default 'Europe/Rome',
  -- { "1": [{"da":"09:00","a":"12:30"}, ...], ..., "7": [] }
  orari jsonb not null,
  chiusure date[] not null default '{}',
  finanziamenti boolean not null default true,
  documenti_finanziamento text not null default '',
  ora_sera smallint not null default 17,
  -- Numero WhatsApp del salone e suo identificativo presso Meta
  whatsapp_numero text unique,
  whatsapp_phone_number_id text unique,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

-- Chi può entrare nel pannello di quale salone.
create table utenti_salone (
  user_id uuid not null references auth.users (id) on delete cascade,
  salone_id uuid not null references saloni (id) on delete cascade,
  ruolo text not null default 'venditore' check (ruolo in ('titolare', 'venditore')),
  primary key (user_id, salone_id)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  salone_id uuid not null references saloni (id) on delete cascade,
  telefono text not null,
  canale text not null check (canale in ('portale', 'sito', 'chiamata_persa', 'whatsapp')),
  fonte text,
  nome text,
  cognome text,
  genere text check (genere in ('M', 'F')),
  auto_interesse text,
  budget text,
  finanziamento boolean,
  permuta boolean,
  usato text,
  giorno_proposto date,
  ora_proposta time,
  appuntamento timestamptz,
  richiamabile boolean,
  stato text not null default 'in_conversazione'
    check (stato in ('in_conversazione', 'appuntamento', 'da_richiamare', 'gestito_da_venditore', 'chiuso')),
  risposte_vuote smallint not null default 0,
  domande_in_sospeso text[] not null default '{}',
  creato_il timestamptz not null default now(),
  ultimo_messaggio_il timestamptz,
  solleciti_inviati smallint not null default 0,
  ultimo_sollecito_il timestamptz
);

-- Un solo lead aperto per numero di telefono e salone: i messaggi in arrivo
-- si agganciano a quello, senza ricerche con LIKE.
create unique index leads_aperti_per_telefono
  on leads (salone_id, telefono)
  where stato in ('in_conversazione', 'appuntamento');
create index leads_per_salone on leads (salone_id, creato_il desc);

create table messaggi (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads (id) on delete cascade,
  salone_id uuid not null references saloni (id) on delete cascade,
  autore text not null check (autore in ('cliente', 'bot', 'venditore')),
  testo text not null,
  -- Id del messaggio presso WhatsApp, per non elaborare due volte lo stesso messaggio
  whatsapp_id text unique,
  il timestamptz not null default now()
);
create index messaggi_per_lead on messaggi (lead_id, il);

-- Appuntamenti fissati, disdette, richieste di richiamo, domande per il venditore.
create table eventi (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads (id) on delete cascade,
  salone_id uuid not null references saloni (id) on delete cascade,
  tipo text not null,
  dati jsonb not null default '{}',
  letto boolean not null default false,
  il timestamptz not null default now()
);
create index eventi_da_leggere on eventi (salone_id, il desc) where not letto;

-- ---------------------------------------------------------------------------
-- Sicurezza: ogni utente vede solo i saloni a cui è associato.
-- ---------------------------------------------------------------------------

create function miei_saloni() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select salone_id from utenti_salone where user_id = auth.uid()
$$;

alter table saloni enable row level security;
alter table utenti_salone enable row level security;
alter table leads enable row level security;
alter table messaggi enable row level security;
alter table eventi enable row level security;

create policy "vede il proprio salone" on saloni
  for select to authenticated using (id in (select miei_saloni()));

create policy "vede la propria associazione" on utenti_salone
  for select to authenticated using (user_id = auth.uid());

create policy "vede i lead del proprio salone" on leads
  for select to authenticated using (salone_id in (select miei_saloni()));
-- Il venditore può prendere in mano una chat o aggiornare un lead del suo salone.
create policy "aggiorna i lead del proprio salone" on leads
  for update to authenticated
  using (salone_id in (select miei_saloni()))
  with check (salone_id in (select miei_saloni()));

create policy "vede i messaggi del proprio salone" on messaggi
  for select to authenticated using (salone_id in (select miei_saloni()));

create policy "vede gli eventi del proprio salone" on eventi
  for select to authenticated using (salone_id in (select miei_saloni()));
create policy "segna come letti gli eventi del proprio salone" on eventi
  for update to authenticated
  using (salone_id in (select miei_saloni()))
  with check (salone_id in (select miei_saloni()));
