// Thin wrappers over the Claude artifact runtime (window.claude), with
// fallbacks so the app also runs as a plain web page (tests, saved copy).
type Downloads = { save(req: { filename: string; data: string | Blob }): Promise<unknown> };
type ClaudeRuntime = { use(name: string): Promise<unknown> };

function runtime(): ClaudeRuntime | null {
  const c = (globalThis as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === "function" ? c : null;
}

export async function getCapability<T>(name: string): Promise<T | null> {
  const rt = runtime();
  if (!rt) return null;
  try {
    return ((await rt.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

/** Offers a file to save. Returns false if this view can't save files. */
export async function saveFile(filename: string, data: string, type = "application/json"): Promise<boolean> {
  const downloads = await getCapability<Downloads>("downloads");
  if (downloads) {
    await downloads.save({ filename, data: new Blob([data], { type }) });
    return true;
  }
  if (runtime()) return false; // inside Claude without the downloads grant
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
