import type { DataContent, FilePart, FileUIPart, ImagePart } from "ai";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";

const MIME_SIGNATURES = [
  { sig: "89504e47", mime: "image/png" },
  { sig: "ffd8ffdb", mime: "image/jpeg" },
  { sig: "ffd8ffe0", mime: "image/jpeg" },
  { sig: "ffd8ffee", mime: "image/jpeg" },
  { sig: "ffd8ffe1", mime: "image/jpeg" },
  { sig: "47494638", mime: "image/gif" },
  { sig: "424d", mime: "image/bmp" },
  { sig: "49492a00", mime: "image/tiff" },
  { sig: "3c737667", mime: "image/svg+xml" },
  { sig: "3c3f786d", mime: "image/svg+xml" },
  { sig: "494433", mime: "audio/mpeg" },
  { sig: "000001ba", mime: "video/mpeg" },
  { sig: "000001b3", mime: "video/mpeg" },
  { sig: "1a45dfa3", mime: "video/webm" },
  { sig: "4f676753", mime: "audio/ogg" },
  { sig: "25504446", mime: "application/pdf" },
  { sig: "504b0304", mime: "application/zip" },
  { sig: "504b0506", mime: "application/zip" },
  { sig: "504b0708", mime: "application/zip" },
  { sig: "52617221", mime: "application/x-rar-compressed" },
  { sig: "7f454c46", mime: "application/x-elf" },
  { sig: "1f8b08", mime: "application/gzip" },
  { sig: "425a68", mime: "application/x-bzip2" },
  { sig: "3c3f786d6c", mime: "application/xml" },
] as const;

const DATA_URI_PATTERN = /^data:\w+\/\w+;base64/;

function guessMimeFromString(value: string) {
  if (DATA_URI_PATTERN.exec(value)) {
    const headerPart = value.split(";")[0];
    if (!headerPart) return "text/plain";
    const mediaType = headerPart.split(":")[1];
    if (mediaType) return mediaType;
  }
  return "text/plain";
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Best-guess MIME type from a magic-number signature at the start of a buffer.
 */
export function guessMimeType(buf: ArrayBuffer | string) {
  if (typeof buf === "string") return guessMimeFromString(buf);
  if (buf.byteLength < 4) return "application/octet-stream";

  const bytes = new Uint8Array(buf.slice(0, 12));
  const hex = bytesToHex(bytes);

  for (const { sig, mime } of MIME_SIGNATURES) {
    if (hex.startsWith(sig)) return mime;
  }
  // RIFF...WEBP and 00000018 + ftyp need a tail check
  if (hex.startsWith("52494646") && hex.substring(16, 24) === "57454250") {
    return "image/webp";
  }
  if (hex.startsWith("00000018") && hex.substring(16, 24) === "66747970") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

/**
 * Serialize an AI SDK `DataContent` or `URL` to a Convex-serializable format.
 */
export function serializeDataOrUrl(dataOrUrl: DataContent | URL) {
  if (typeof dataOrUrl === "string") return dataOrUrl;
  if (dataOrUrl instanceof ArrayBuffer) return dataOrUrl;
  if (dataOrUrl instanceof URL) return dataOrUrl.toString();
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return dataOrUrl.buffer.slice(
    dataOrUrl.byteOffset,
    dataOrUrl.byteOffset + dataOrUrl.byteLength,
  ) as ArrayBuffer;
}

export function toModelMessageDataOrUrl(
  urlOrString: string | ArrayBuffer | URL | DataContent,
) {
  if (urlOrString instanceof URL) return urlOrString;
  if (typeof urlOrString === "string") {
    if (
      urlOrString.startsWith("http://") ||
      urlOrString.startsWith("https://")
    ) {
      return new URL(urlOrString);
    }
    return urlOrString;
  }
  return urlOrString;
}

export function toUIFilePart(part: ImagePart | FilePart) {
  const dataOrUrl = part.type === "image" ? part.image : part.data;
  const url =
    dataOrUrl instanceof ArrayBuffer
      ? convertUint8ArrayToBase64(new Uint8Array(dataOrUrl))
      : dataOrUrl.toString();
  if (!part.mediaType) {
    throw new Error("toUIFilePart requires a mediaType");
  }
  return {
    type: "file" as const,
    mediaType: part.mediaType,
    filename: part.type === "file" ? part.filename : undefined,
    url,
    providerMetadata: part.providerOptions,
  } satisfies FileUIPart;
}
