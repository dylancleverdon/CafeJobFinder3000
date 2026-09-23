/** Stable, path-safe id from a string (two FNV-1a hashes → ~64 bits). */
export function stableId(prefix: string, input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b ^= b >>> 15;
  }
  return prefix + a.toString(36) + b.toString(36);
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2, 14);
  return prefix + Date.now().toString(36) + rand;
}
