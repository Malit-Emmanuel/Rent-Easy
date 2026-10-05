/** Normalise Kenyan mobile numbers to E.164 (+2547XXXXXXXX / +2541XXXXXXXX). Returns null if not valid. */
export function normaliseKenyanPhone(raw: string): string | null {
  const d = raw.replace(/[\s\-()]/g, '');
  const m = d.match(/^(?:\+?254|0)([17]\d{8})$/);
  return m ? `+254${m[1]}` : null;
}
