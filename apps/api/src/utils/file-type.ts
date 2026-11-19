import { Errors } from "./errors.ts";

export const SUPPORTED_FILES = {
  ".pdf": {
    mimeType: "application/pdf",
    // "%PDF-"
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  ".docx": {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // ZIP local file header "PK\x03\x04" (DOCX is a ZIP container)
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
} as const;

export type SupportedExtension = keyof typeof SUPPORTED_FILES;
export const SUPPORTED_MIME_TYPES = Object.values(SUPPORTED_FILES).map(
  (f) => f.mimeType,
);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Validates an upload three ways — extension, MIME type, and file signature
 * (magic bytes). Note: Bun's multipart parser derives `File.type` from the
 * filename, so the magic-byte check is what actually catches renamed files.
 */
export async function detectFileKind(file: File) {
  const extension = extensionOf(file.name);
  if (!(extension in SUPPORTED_FILES)) {
    throw Errors.unsupportedFile(
      `Unsupported file extension "${extension || "(none)"}". Use .pdf or .docx`,
    );
  }
  const spec = SUPPORTED_FILES[extension as SupportedExtension];

  const declared = file.type.split(";")[0]?.trim().toLowerCase();
  if (declared !== spec.mimeType) {
    throw Errors.unsupportedFile(
      `MIME type "${file.type || "(none)"}" does not match ${extension}`,
    );
  }

  const header = new Uint8Array(
    await file.slice(0, spec.magic.length).arrayBuffer(),
  );
  if (!spec.magic.every((byte, i) => header[i] === byte)) {
    throw Errors.unsupportedFile(
      `File content is not a valid ${extension.slice(1).toUpperCase()} file`,
    );
  }

  return {
    extension: extension as SupportedExtension,
    mimeType: spec.mimeType,
  };
}
