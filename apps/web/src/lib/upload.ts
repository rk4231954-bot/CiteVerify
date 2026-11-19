import { formatBytes } from "./format.ts";
import type { AppConfig } from "./types.ts";

/** Client-side validation mirroring the server's limits (from GET /api/config). The server re-validates. */
export function validateFile(
  file: Pick<File, "name" | "size" | "type">,
  upload: AppConfig["upload"],
): string | null {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (!upload.extensions.includes(ext))
    return `Unsupported file type${ext ? ` (${ext})` : ""}. Upload a ${upload.extensions.map((e) => e.slice(1).toUpperCase()).join(" or ")} file.`;
  if (
    file.type &&
    !upload.mimeTypes.includes(file.type) &&
    file.type !== "application/octet-stream"
  )
    return `The file reports type "${file.type}", which is not a PDF or DOCX.`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > upload.maxBytes)
    return `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(upload.maxBytes)}.`;
  return null;
}
