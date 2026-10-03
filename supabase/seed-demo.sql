-- Il salone usato per le demo. Sostituire whatsapp_phone_number_id con quello
-- del proprio numero di prova (WhatsApp Manager → API Setup).
insert into saloni (id, nome, citta, indirizzo, orari, finanziamenti, documenti_finanziamento, whatsapp_phone_number_id)
values (
  '00000000-0000-4000-8000-000000000001',
  'Autosalone Demo',
  'Livorno',
  'Via dell''Esempio 1, Livorno',
  '{
    "1": [{"da": "09:00", "a": "12:30"}, {"da": "15:00", "a": "19:00"}],
    "2": [{"da": "09:00", "a": "12:30"}, {"da": "15:00", "a": "19:00"}],
    "3": [{"da": "09:00", "a": "12:30"}, {"da": "15:00", "a": "19:00"}],
    "4": [{"da": "09:00", "a": "12:30"}, {"da": "15:00", "a": "19:00"}],
    "5": [{"da": "09:00", "a": "12:30"}, {"da": "15:00", "a": "19:00"}],
    "6": [{"da": "09:00", "a": "12:30"}]
  }',
  true,
  'un documento d''identità, il codice fiscale e l''ultima busta paga',
  'INSERIRE_PHONE_NUMBER_ID'
)
on conflict (id) do nothing;
