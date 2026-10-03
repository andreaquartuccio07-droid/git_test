// ===========================================================================
// PREPARA LEAD
// Sistema i dati del nuovo contatto: numero di telefono in formato +39...,
// iniziali maiuscole per nome e auto. Se il numero non è valido si ferma.
// ===========================================================================

const d = $input.first().json;

// Porta il numero nel formato internazionale +39..., qualunque sia la fonte.
function normalizzaTelefono(grezzo) {
  let s = String(grezzo || '').trim().replace(/^whatsapp:/, '').replace(/[\s\-().\/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (!/^\d+$/.test(s)) return null;
  if (/^3\d{8,9}$/.test(s) || /^0\d{5,10}$/.test(s)) return '+39' + s;
  if (/^\d{11,15}$/.test(s)) return '+' + s;
  return null;
}

// "ford fiesta del 2019" → "Ford Fiesta del 2019"; le parole già maiuscole (BMW)
// e quelle piccole come "del", "di", "e" restano come sono.
const PICCOLE = ['di', 'del', 'della', 'dei', 'da', 'dal', 'e', 'con', 'in'];
const iniziali = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ')
  .map((p, i) => (i > 0 && PICCOLE.includes(p) ? p : p.replace(/^\p{Ll}/u, (c) => c.toUpperCase())))
  .join(' ');

const telefono = normalizzaTelefono(d.telefono ?? d.From);
if (!telefono) throw new Error(`Numero di telefono non valido: ${d.telefono ?? d.From}`);

return [{
  json: {
    telefono,
    nome: iniziali(d.nome),
    canale: String(d.canale || 'sito').trim(),
    auto: iniziali(d.auto_interesse ?? d.auto),
  },
}];
