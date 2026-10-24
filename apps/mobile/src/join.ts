/**
 * Pulls the join code out of a scanned QR / pasted link (…/join/<code>) or a
 * typed code. Typed codes may have spaces or dashes and any case, as shown in
 * the dashboard ("AD90 2C3B 8D2B 40").
 */
export function parseJoinCode(text: string): string | null {
  const t = text.trim();
  const fromLink = t.match(/\/join\/([a-z0-9]{10,32})(?:[/?#]|$)/i);
  if (fromLink) return fromLink[1]!.toLowerCase();
  const typed = t.replace(/[\s-]/g, '');
  return /^[a-z0-9]{10,32}$/i.test(typed) ? typed.toLowerCase() : null;
}
