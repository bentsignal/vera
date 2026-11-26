import * as Crypto from "expo-crypto";
import {
  cacheDirectory,
  copyAsync,
  downloadAsync,
  makeDirectoryAsync,
} from "expo-file-system/legacy";

import type { MessageAttachment } from "./types";
import {
  beginPreview,
  cancelPreview,
  hasMediaTools,
  previewFile,
} from "~/features/messaging/media-tools";
import { openLink } from "~/lib/open-link";

// A PDF opens in the phone's own viewer (Quick Look on iOS, the system's
// PDF app on Android), which needs the file on the device. On iOS the
// viewer opens at once, loading, while the file downloads; a file this
// device sent, or opened before, is already here. Other files, and builds
// without the viewer, open in the in-app browser.

/** Files already on the device, by their uploaded address. */
const onDevice = new Map<string, string>();

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

/**
 * The PDF in the previews folder (the one Android lets a viewer read): a
 * copy of this device's own file when it sent it, or a download.
 */
async function fetchPdf({ localUrl, name, url }: MessageAttachment) {
  const known = onDevice.get(url);
  if (known !== undefined) return known;
  // In its own folder, so the viewer shows the file's own name.
  const folder = `${cacheDirectory ?? ""}previews/${Crypto.randomUUID()}/`;
  await makeDirectoryAsync(folder, { intermediates: true });
  const path = `${folder}${fileName(name)}`;
  const copied =
    localUrl !== undefined &&
    (await copyAsync({ from: localUrl, to: path }).then(
      () => true,
      () => false,
    ));
  if (!copied) {
    const { status } = await downloadAsync(url, path);
    if (status < 200 || status >= 300) throw new Error(`Download ${status}`);
  }
  onDevice.set(url, path);
  return path;
}

async function previewPdf(attachment: MessageAttachment) {
  const waiting = await beginPreview(attachment.name);
  const path = await fetchPdf(attachment).catch(async (error: unknown) => {
    if (waiting) await cancelPreview();
    throw error;
  });
  if (!(await previewFile(path))) throw new Error("No viewer");
}

/** Opens an uploaded file attachment. */
export function openFileAttachment(attachment: MessageAttachment) {
  if (!hasMediaTools || !isPdf(attachment)) {
    openLink(attachment.url);
    return;
  }
  void previewPdf(attachment).catch(() => openLink(attachment.url));
}
