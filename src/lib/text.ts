const KEEP_UPPER = new Set([
  "N", "S", "E", "W", "NE", "NW", "SE", "SW", "LLC", "INC", "LLP", "PLLC", "USA", "US", "BBQ", "II", "III", "IV", "UW", "SLU", "PNW", "WA",
]);

/** "FUEL COFFEE" → "Fuel Coffee", "1705 N 45TH ST" → "1705 N 45th St", "STARBUCKS COFFEE   9303" → "Starbucks Coffee #9303". */
export function titleCase(input: string): string {
  const cleaned = input.trim().replace(/\s{2,}(\d+)$/, " #$1").replace(/\s+/g, " ");
  return cleaned
    .split(" ")
    .map((word) => {
      if (KEEP_UPPER.has(word.toUpperCase().replace(/[^A-Z]/g, "")) && /^[A-Za-z]+[.,]?$/.test(word)) return word.toUpperCase();
      if (/^\d+(ST|ND|RD|TH)$/i.test(word)) return word.toLowerCase();
      return word
        .toLowerCase()
        .replace(/(^|[-/&(."])([a-zà-ÿ])/g, (_, p: string, c: string) => p + c.toUpperCase())
        .replace(/^Mc([a-z])/, (_, c: string) => `Mc${c.toUpperCase()}`);
    })
    .join(" ")
    .replace(/'S\b/g, "'s");
}

export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw.trim() || null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** "20140814" → "2014-08-14" */
export function yyyymmddToIso(raw: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec((raw ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
