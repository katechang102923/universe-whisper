/**
 * Strip HTML line-break tags and normalise whitespace for plain-text contexts
 * (LINE messages, website reading display, email plain-text part).
 *
 * Email HTML builders (para / subPara) must NOT call this — they convert \n
 * back to <br/> themselves, so the round-trip is: normalise → \n → <br/>.
 */
export function normalizePlainText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
