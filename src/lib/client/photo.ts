/** Shrinks a camera photo in the browser to a small JPEG data URL (≤ ~200 KB) so it fits in the app's storage. */
export async function downscalePhoto(file: File, maxChars = 200_000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let side = 900;
  let quality = 0.65;
  let out = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= maxChars) break;
    side = Math.round(side * 0.8);
    quality = Math.max(0.45, quality - 0.05);
  }
  bitmap.close();
  return out;
}
