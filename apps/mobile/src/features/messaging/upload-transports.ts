import type { Id } from "@vera/backend/dataModel";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { api } from "@vera/backend/api";

export type UploadTarget = FunctionReturnType<typeof api.files.createUpload>;

interface LocalUpload {
  readonly mimeType: string;
  readonly name: string;
  readonly uri: string;
}

function storageIdOf(body: unknown) {
  return typeof body === "object" &&
    body !== null &&
    "storageId" in body &&
    typeof body.storageId === "string"
    ? body.storageId
    : undefined;
}

async function sendBinary(
  url: string,
  file: LocalUpload,
  httpMethod: "POST" | "PUT",
  headers: Readonly<Record<string, string>> = {},
) {
  const response = await uploadAsync(url, file.uri, {
    headers: { "Content-Type": file.mimeType, ...headers },
    httpMethod,
    uploadType: FileSystemUploadType.BINARY_CONTENT,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed (${response.status})`);
  }
  return response.body;
}

/** Convex file storage, used when no media provider is configured. */
async function sendToConvex(
  convex: ConvexHttpClient,
  url: string,
  file: LocalUpload,
) {
  const storageId = storageIdOf(
    JSON.parse(await sendBinary(url, file, "POST")),
  );
  if (storageId === undefined) throw new Error("Upload failed");
  const result = await convex.mutation(api.files.completeUpload, {
    // The server's v.id("_storage") validator checks the format.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    storageId: storageId as Id<"_storage">,
  });
  return result.url;
}

/** Sends a local file to wherever the server said, returning its URL. */
export async function sendUpload(
  convex: ConvexHttpClient,
  target: UploadTarget,
  file: LocalUpload,
) {
  switch (target.protocol) {
    case "convex":
      return sendToConvex(convex, target.url, file);
    case "put": {
      // bunny.net Storage, through a URL presigned for this one object.
      await sendBinary(target.url, file, "PUT", target.headers);
      return target.publicUrl;
    }
  }
}
