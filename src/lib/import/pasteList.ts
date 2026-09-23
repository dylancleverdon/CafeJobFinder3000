/**
 * Turns a pasted article / stockist list into candidate cafe names.
 * "1. Victrola Coffee – Capitol Hill" → { name: "Victrola Coffee", note: "Capitol Hill" }
 */
export type PastedCandidate = { name: string; note: string | null };

const BULLET = /^\s*(?:[-*•·▪◦–—]+|\(?\d{1,3}[.)\]:]?|#\d+[.:)]?)\s+/;
const SEPARATOR = /\s+[–—|]\s+|\s+-\s+|:\s+|\s*\|\s*/

export function parsePastedList(text: string): PastedCandidate[] {
  const out: PastedCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(BULLET, "").trim();
    if (!line || /^https?:\/\//i.test(line)) continue;
    line = line.replace(/\*\*|__/g, "").trim();
    const [namePart, ...rest] = line.split(SEPARATOR);
    const name = namePart.trim().replace(/[.,;]+$/, "");
    if (name.length < 2 || name.length > 60) continue;
    // Skip sentences — cafe names are short.
    if (name.split(/\s+/).length > 7 || /[.!?]$/.test(namePart.trim())) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const note = rest.join(" – ").trim();
    out.push({ name, note: note || null });
  }
  return out;
}
