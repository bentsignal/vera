import * as Crypto from "expo-crypto";
import {
  cacheDirectory,
  downloadAsync,
  makeDirectoryAsync,
} from "expo-file-system/legacy";

import type { MessageAttachment } from "./types";
import { hasMediaTools, previewFile } from "~/features/messaging/media-tools";
import { openLink } from "~/lib/open-link";

// A PDF opens in the phone's own viewer (Quick Look on iOS, the system's
// PDF app on Android), which needs the file on the device first. Other
// files, and builds without the viewer, open in the in-app browser.

function isPdf({ mimeType, name }: MessageAttachment) {
  return (
    mimeType.toLowerCase() === "application/pdf" ||
    name.toLowerCase().endsWith(".pdf")
  );
}

/** A name that's safe as a file name, ending in .pdf. */
function fileName(name: string) {
  const base = [...name]
    .map((char) => (char < " " || '/\\:*?"<>|'.includes(char) ? "_" : char))
    .join("")
    .trim();
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "file"}.pdf`;
}

async function previewPdf(attachment: MessageAttachment) {
  // In its own folder, so the viewer shows the file's own name.
  const folder = `${cacheDirectory ?? ""}previews/${Crypto.randomUUID()}/`;
  await makeDirectoryAsync(folder, { intermediates: true });
  // The download is the one wait: the viewer can't open a file before
  // it's here.
  const { status, uri } = await downloadAsync(
    attachment.url,
    `${folder}${fileName(attachment.name)}`,
  );
  if (status < 200 || status >= 300) throw new Error(`Download ${status}`);
  if (!(await previewFile(uri))) throw new Error("No viewer");
}

/** Opens an uploaded file attachment. */
export function openFileAttachment(attachment: MessageAttachment) {
  if (!hasMediaTools || !isPdf(attachment)) {
    openLink(attachment.url);
    return;
  }
  void previewPdf(attachment).catch(() => openLink(attachment.url));
}
