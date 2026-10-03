// ===========================================================================
// PRIMO MESSAGGIO
// Il primo messaggio a un cliente che non ci ha ancora scritto. Con un numero
// WhatsApp vero deve essere un template approvato da Meta: questi testi vanno
// registrati identici (vedi docs/configurare-whatsapp.md).
// ===========================================================================

const lead = $('Prepara lead').first().json;
const salone = $('Crea o trova lead').first().json.salone;
const sera = DateTime.now().setZone(salone.fuso_orario || 'Europe/Rome').hour >= (salone.ora_sera || 17);
const saluto = sera ? 'Buonasera' : 'Buongiorno';
const momento = sera ? 'sera' : 'giorno';

let template, parametri, testo;
if (lead.canale === 'chiamata persa') {
  template = `primo_contatto_chiamata_persa_${momento}`;
  parametri = [salone.nome];
  testo = `${saluto}, sono l'assistente di ${salone.nome}. Ha chiamato poco fa e non siamo riusciti a risponderle. Mi dice per quale auto ci aveva cercato?`;
} else if (lead.auto) {
  template = `primo_contatto_richiesta_auto_${momento}`;
  parametri = [salone.nome, lead.auto];
  testo = `${saluto}, sono l'assistente di ${salone.nome}. La ringrazio per la richiesta sulla ${lead.auto}. Mi saprebbe indicare un budget di massima?`;
} else {
  template = `primo_contatto_richiesta_${momento}`;
  parametri = [salone.nome];
  testo = `${saluto}, sono l'assistente di ${salone.nome}. La ringrazio per la sua richiesta. Mi dice per quale auto ci aveva cercato?`;
}

return [{ json: { template, parametri, testo } }];
