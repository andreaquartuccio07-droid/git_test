import pg from "pg";
import type { Evento } from "../motore/motore.js";
import type { Lead, OrariSettimana, Salone, StatoLead } from "../dominio/tipi.js";
import type { Archivio, MessaggioArchiviato, NuovoLead, NuovoMessaggio } from "./archivio.js";

// Le date (AAAA-MM-GG) restano stringhe, senza passare dal fuso orario del server.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const COLONNE_SALONE = `id, nome, citta, indirizzo, fuso_orario, orari, chiusure::text[] as chiusure,
  finanziamenti, documenti_finanziamento, ora_sera, whatsapp_phone_number_id`;

const COLONNE_LEAD = `id, salone_id, telefono, canale, fonte, nome, cognome, genere, auto_interesse,
  budget, finanziamento, permuta, usato, giorno_proposto, to_char(ora_proposta, 'HH24:MI') as ora_proposta,
  appuntamento, richiamabile, stato, risposte_vuote, domande_in_sospeso, creato_il, ultimo_messaggio_il`;

const STATI_APERTI = `stato in ('in_conversazione', 'appuntamento')`;

type Riga = Record<string, any>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function salone(r: Riga): Salone {
  return {
    id: r.id,
    nome: r.nome,
    citta: r.citta,
    indirizzo: r.indirizzo,
    fusoOrario: r.fuso_orario,
    orari: r.orari as OrariSettimana,
    chiusure: r.chiusure ?? [],
    finanziamenti: r.finanziamenti,
    documentiFinanziamento: r.documenti_finanziamento,
    oraSera: r.ora_sera,
    whatsappPhoneNumberId: r.whatsapp_phone_number_id,
  };
}

function lead(r: Riga): Lead {
  return {
    id: r.id,
    saloneId: r.salone_id,
    telefono: r.telefono,
    canale: r.canale,
    fonte: r.fonte,
    nome: r.nome,
    cognome: r.cognome,
    genere: r.genere,
    autoInteresse: r.auto_interesse,
    budget: r.budget,
    finanziamento: r.finanziamento,
    permuta: r.permuta,
    usato: r.usato,
    giornoProposto: r.giorno_proposto,
    oraProposta: r.ora_proposta,
    appuntamento: iso(r.appuntamento),
    richiamabile: r.richiamabile,
    stato: r.stato as StatoLead,
    risposteVuote: r.risposte_vuote,
    domandeInSospeso: r.domande_in_sospeso,
    creatoIl: iso(r.creato_il)!,
    ultimoMessaggioIl: iso(r.ultimo_messaggio_il),
  };
}

/**
 * Archivio su Postgres: in produzione è il database di Supabase, a cui il
 * server si collega con la stringa di connessione (DATABASE_URL). Questo
 * accesso scavalca le regole RLS, che valgono invece per il pannello.
 */
export class ArchivioPostgres implements Archivio {
  constructor(private readonly db: pg.Pool) {}

  async salone(id: string) {
    const { rows } = await this.db.query(`select ${COLONNE_SALONE} from saloni where id = $1 and attivo`, [id]);
    return rows[0] ? salone(rows[0]) : null;
  }

  async saloneDaNumeroWhatsApp(phoneNumberId: string) {
    const { rows } = await this.db.query(
      `select ${COLONNE_SALONE} from saloni where whatsapp_phone_number_id = $1 and attivo`,
      [phoneNumberId],
    );
    return rows[0] ? salone(rows[0]) : null;
  }

  async lead(id: string) {
    const { rows } = await this.db.query(`select ${COLONNE_LEAD} from leads where id = $1`, [id]);
    return rows[0] ? lead(rows[0]) : null;
  }

  async leadAperto(saloneId: string, telefono: string) {
    const { rows } = await this.db.query(
      `select ${COLONNE_LEAD} from leads
       where salone_id = $1 and telefono = $2 and ${STATI_APERTI}
       order by creato_il desc limit 1`,
      [saloneId, telefono],
    );
    return rows[0] ? lead(rows[0]) : null;
  }

  async ultimoLead(saloneId: string, telefono: string) {
    const { rows } = await this.db.query(
      `select ${COLONNE_LEAD} from leads where salone_id = $1 and telefono = $2
       order by creato_il desc limit 1`,
      [saloneId, telefono],
    );
    return rows[0] ? lead(rows[0]) : null;
  }

  async creaLead(dati: NuovoLead) {
    const { rows } = await this.db.query(
      `insert into leads (salone_id, telefono, canale, fonte, nome, auto_interesse)
       values ($1, $2, $3, $4, $5, $6)
       returning ${COLONNE_LEAD}`,
      [dati.saloneId, dati.telefono, dati.canale, dati.fonte ?? null, dati.nome ?? null, dati.autoInteresse ?? null],
    );
    return lead(rows[0]!);
  }

  async salvaLead(l: Lead) {
    await this.db.query(
      `update leads set
         nome = $2, cognome = $3, genere = $4, auto_interesse = $5, budget = $6,
         finanziamento = $7, permuta = $8, usato = $9, giorno_proposto = $10,
         ora_proposta = $11, appuntamento = $12, richiamabile = $13, stato = $14,
         risposte_vuote = $15, domande_in_sospeso = $16, ultimo_messaggio_il = $17,
         fonte = $18
       where id = $1`,
      [
        l.id, l.nome, l.cognome, l.genere, l.autoInteresse, l.budget,
        l.finanziamento, l.permuta, l.usato, l.giornoProposto,
        l.oraProposta, l.appuntamento, l.richiamabile, l.stato,
        l.risposteVuote, l.domandeInSospeso, l.ultimoMessaggioIl,
        l.fonte,
      ],
    );
  }

  async aggiungiMessaggio(l: Lead, m: NuovoMessaggio) {
    const { rowCount } = await this.db.query(
      `insert into messaggi (lead_id, salone_id, autore, testo, tipo, elaborato, whatsapp_id, il)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
       on conflict (whatsapp_id) do nothing`,
      [l.id, l.saloneId, m.autore, m.testo, m.tipo ?? "testo", m.elaborato, m.whatsappId ?? null, m.il ?? null],
    );
    return rowCount === 1;
  }

  /** In ordine di arrivo al server: l'orario indicato da WhatsApp può non combaciare con quello del server. */
  async messaggi(leadId: string, limite: number): Promise<MessaggioArchiviato[]> {
    const { rows } = await this.db.query(
      `select * from (
         select id::text, autore, testo, tipo, elaborato, il from messaggi
         where lead_id = $1 order by id desc limit $2
       ) m order by id::bigint`,
      [leadId, limite],
    );
    return rows.map((r) => ({
      id: r.id,
      autore: r.autore,
      testo: r.testo,
      tipo: r.tipo,
      elaborato: r.elaborato,
      il: iso(r.il)!,
    }));
  }

  async segnaElaborati(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.query(`update messaggi set elaborato = true where id = any($1::bigint[])`, [ids]);
  }

  async registraEventi(l: Lead, eventi: Evento[]) {
    for (const e of eventi) {
      const { tipo, ...dati } = e;
      await this.db.query(`insert into eventi (lead_id, salone_id, tipo, dati) values ($1, $2, $3, $4)`, [
        l.id,
        l.saloneId,
        tipo,
        dati,
      ]);
    }
  }
}
