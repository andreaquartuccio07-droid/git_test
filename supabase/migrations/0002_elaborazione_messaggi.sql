-- Messaggi non di testo (vocali, foto) e raggruppamento dei messaggi ravvicinati:
-- i messaggi del cliente restano "da elaborare" per qualche secondo, poi il bot
-- li legge tutti insieme e risponde una volta sola.
alter table messaggi add column tipo text not null default 'testo'
  check (tipo in ('testo', 'vocale', 'immagine', 'altro'));
alter table messaggi add column elaborato boolean not null default true;
create index messaggi_da_elaborare on messaggi (lead_id) where not elaborato;
