import type { Id } from "@vera/backend/dataModel";
import type { UploadKind } from "@vera/backend/upload-limits";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import {
  createUploadTask,
  FileSystemSessionType,
  FileSystemUploadType,
} from "expo-file-system/legacy";
import { api } from "@vera/backend/api";

export type UploadTarget = FunctionReturnType<typeof api.files.createUpload>;

interface LocalUpload {
  readonly mimeType: string;
  readonly name: string;
  readonly uri: string;
}

/** Called with the bytes sent so far. */
export type OnBytesSent = (bytes: number) => void;

function storageIdOf(body: unknown) {
  return typeof body === "object" &&
    body !== null &&
    "storageId" in body &&
    typeof body.storageId === "string"
    ? body.storageId
    : undefined;
}

/**
 * Streams the file from disk as the request body, so a large video never
 * sits in JavaScript memory, and reports progress as it goes.
 */
async function sendBinary({
  url,
  file,
  httpMethod,
  headers = {},
  onBytesSent,
}: {
  url: string;
  file: LocalUpload;
  httpMethod: "POST" | "PUT";
  headers?: Readonly<Record<string, string>>;
  onBytesSent?: OnBytesSent;
}) {
  const task = createUploadTask(
    url,
    file.uri,
    {
      headers: { "Content-Type": file.mimeType, ...headers },
      httpMethod,
      // An iOS background session never gives up on an unreachable host;
      // it waits for days, so the upload would spin forever instead of
      // offering Try Again. A foreground one fails within a minute.
      sessionType: FileSystemSessionType.FOREGROUND,
      uploadType: FileSystemUploadType.BINARY_CONTENT,
    },
    (progress) => onBytesSent?.(progress.totalBytesSent),
  );
  const response = await task.uploadAsync();
  if (response == null) throw new Error("Upload cancelled");
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed (${response.status})`);
  }
  return response.body;
}

/** Convex file storage, used when no media provider is configured. */
async function sendToConvex(
  convex: ConvexHttpClient,
  url: string,
  { file, kind, onBytesSent }: Omit<Parameters<typeof sendUpload>[1], "target">,
) {
  const storageId = storageIdOf(
    JSON.parse(
      await sendBinary({ file, httpMethod: "POST", onBytesSent, url }),
    ),
  );
  if (storageId === undefined) throw new Error("Upload failed");
  const result = await convex.mutation(api.files.completeUpload, {
    kind,
    // The server's v.id("_storage") validator checks the format.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    storageId: storageId as Id<"_storage">,
  });
  return result.url;
}

/** Sends a local file to wherever the server said, returning its URL. */
export async function sendUpload(
  convex: ConvexHttpClient,
  {
    file,
    kind,
    onBytesSent,
    target,
  }: {
    file: LocalUpload;
    kind: UploadKind;
    onBytesSent?: OnBytesSent;
    target: UploadTarget;
  },
) {
  switch (target.protocol) {
    case "convex":
      return sendToConvex(convex, target.url, { file, kind, onBytesSent });
    case "put": {
      // bunny.net Storage, through a URL presigned for this one object.
      await sendBinary({
        file,
        headers: target.headers,
        httpMethod: "PUT",
        onBytesSent,
        url: target.url,
      });
      return target.publicUrl;
    }
  }
}
