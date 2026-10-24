/** Pulls the join code out of a scanned QR / pasted link (…/join/<code>) or a bare code. */
export function parseJoinCode(text: string): string | null {
  const t = text.trim();
  const fromLink = t.match(/\/join\/([a-z0-9]{10,32})(?:[/?#]|$)/i);
  if (fromLink) return fromLink[1]!.toLowerCase();
  return /^[a-z0-9]{10,32}$/i.test(t) ? t.toLowerCase() : null;
}
