/**
 * Porta un numero di telefono nel formato internazionale +39... così lo stesso
 * cliente è riconosciuto qualunque sia la fonte (portale, sito, WhatsApp).
 * Restituisce null se il numero non è valido.
 */
export function normalizzaTelefono(grezzo: string): string | null {
  let s = grezzo.trim().replace(/[\s\-().\/]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (!/^\d+$/.test(s)) return null;
  // Cellulare italiano (3xx) o fisso (0x) scritto senza prefisso internazionale.
  if (/^3\d{8,9}$/.test(s) || /^0\d{5,10}$/.test(s)) return `+39${s}`;
  // Già con prefisso internazionale ma senza il +.
  if (/^\d{11,15}$/.test(s)) return `+${s}`;
  return null;
}

/** WhatsApp indica il mittente con il numero internazionale senza il +. */
export function telefonoDaWhatsApp(waId: string): string {
  return `+${waId.replace(/^\+/, "")}`;
}

/** Il formato che vuole WhatsApp per il destinatario: solo cifre. */
export function telefonoPerWhatsApp(telefono: string): string {
  return telefono.replace(/^\+/, "");
}
