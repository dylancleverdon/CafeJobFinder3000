// National/regional chains. They still hire lots of baristas, so they're kept —
// just badged so you can filter them.
const CHAIN_PATTERNS: RegExp[] = [
  /\bSTARBUCKS\b/,
  /\bPEET'?S\b/,
  /\bDUTCH BROS\b/,
  /\bTIM HORTONS?\b/,
  /\bDUNKIN\b/,
  /\bCARIBOU COFFEE\b/,
  /\bTULLY'?S\b/,
  /\bSEATTLE'?S BEST\b/,
  /\bBLUE BOTTLE\b/,
  /\bPHILZ\b/,
  /\bLA COLOMBE\b/,
  /\bCOFFEE BEAN (&|AND) TEA LEAF\b/,
  /\bBIGGBY\b/,
  /\bBLACK ROCK COFFEE\b/,
  /\b7 BREW\b/,
  /\bSCOOTER'?S COFFEE\b/,
  /\bPANERA\b/,
  /\bEINSTEIN BRO/,
  /\bKRISPY KREME\b/,
  /\bCOFFEE BEAN INTERNATIONAL\b/,
  /\bJAMBA\b/,
  /\bKUNG FU TEA\b/,
  /\bGONG CHA\b/,
  /\bSHARETEA\b/,
  /\bHEYTEA\b/,
  /\bBEN (&|AND) JERRY/,
  /\bDAIRY QUEEN\b/,
  /\bSUBWAY\b/,
  /\bMCDONALD/,
];

export function isChain(...names: (string | null | undefined)[]): boolean {
  const text = names.filter(Boolean).join(" ").toUpperCase();
  return CHAIN_PATTERNS.some((re) => re.test(text));
}
