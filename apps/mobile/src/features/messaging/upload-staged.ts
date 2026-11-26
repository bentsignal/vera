import type { Attachment } from "@decentralized-convex/messages";
import { api } from "@vera/backend/api";

import type { LocalFile, StagedFile } from "./attachments";
import type { AccountSession } from "~/features/session/account-session";
import { formatBytes } from "~/lib/format";
import { fitForUpload, fitPoster, needsShrinking } from "./media-tools";
import { attachmentError } from "./upload-errors";
import { sendUpload } from "./upload-transports";

/** Writes one line of a send's timing to the dev log (outbox.ts). */
export type TimingLog = (line: string) => void;

function stopwatch() {
  let last = Date.now();
  return () => {
    const now = Date.now();
    const seconds = ((now - last) / 1000).toFixed(1);
    last = now;
    return `${seconds}s`;
  };
}

async function uploadOne(
  session: AccountSession,
  kind: Attachment["kind"],
  file: LocalFile,
  onBytesSent: (bytes: number) => void,
) {
  const convex = await session.convex();
  const target = await convex
    .action(api.files.createUpload, {
      kind,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size,
    })
    .catch((error: unknown) => {
      throw attachmentError(error);
    });
  return sendUpload(convex, { file, kind, onBytesSent, target }).catch(
    (error: unknown) => {
      throw attachmentError(error);
    },
  );
}

/**
 * Uploads a staged file (and a video's poster), reporting progress from 0
 * to 1, and returns the attachment to send. A photo or video over the cap
 * shrinks first (media-tools.ts), which takes the first half of the
 * progress. A poster that fails to upload is left off; the conversation
 * draws one from the video instead.
 */
export async function uploadStaged(
  session: AccountSession,
  staged: StagedFile,
  reportProgress: (fraction: number) => void = () => undefined,
  log: TimingLog = () => undefined,
) {
  const lap = stopwatch();
  const label = `${staged.kind} ${staged.name}`;
  const shrinks = needsShrinking(staged);
  const shrunk = await fitForUpload(staged, (fraction) =>
    reportProgress(fraction / 2),
  );
  const poster =
    shrunk.poster === undefined ? undefined : await fitPoster(shrunk.poster);
  const file = { ...shrunk, poster };
  if (shrinks) {
    log(
      `${label}: shrink ${lap()}, ${formatBytes(staged.size)} → ${formatBytes(file.size)}`,
    );
  }
  function onProgress(fraction: number) {
    reportProgress(shrinks ? 0.5 + fraction / 2 : fraction);
  }
  const posterSize = poster?.size ?? 0;
  const total = Math.max(1, file.size + posterSize);
  const url = await uploadOne(session, file.kind, file, (bytes) =>
    onProgress(Math.min(bytes, file.size) / total),
  );
  log(`${label}: upload ${lap()}, ${formatBytes(file.size)}`);
  const thumbnailUrl =
    poster === undefined
      ? undefined
      : await uploadOne(session, "image", poster, (bytes) =>
          onProgress((file.size + Math.min(bytes, posterSize)) / total),
        ).catch(() => undefined);
  if (poster !== undefined) {
    log(`${label}: poster upload ${lap()}, ${formatBytes(posterSize)}`);
  }
  onProgress(1);
  return {
    durationMs: file.durationMs,
    height: file.height,
    kind: file.kind,
    mimeType: file.mimeType,
    name: file.name,
    size: file.size,
    thumbnailUrl,
    url,
    width: file.width,
  } satisfies Attachment;
}
