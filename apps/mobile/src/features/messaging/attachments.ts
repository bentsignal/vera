import type { Attachment } from "@decentralized-convex/messages";
import type { Id } from "@vera/backend/dataModel";
import * as DocumentPicker from "expo-document-picker";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api } from "@vera/backend/api";
import { useConvex } from "convex/react";

const MAX_ATTACHMENTS = 10;

interface LocalFile {
  readonly durationMs?: number;
  readonly height?: number;
  readonly kind: Attachment["kind"];
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
  readonly uri: string;
  readonly width?: number;
}

export type AttachmentSource = "camera" | "files" | "library";

async function pick(source: AttachmentSource) {
  if (source === "files") {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      kind: "file" as const,
      mimeType: asset.mimeType ?? "application/octet-stream",
      name: asset.name,
      size: asset.size ?? 0,
      uri: asset.uri,
    }));
  }
  const options = {
    allowsMultipleSelection: source === "library",
    mediaTypes: ["images", "videos"],
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 0.8,
    selectionLimit: MAX_ATTACHMENTS,
  } satisfies ImagePicker.ImagePickerOptions;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return [];
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    const kind =
      asset.type === "video" ? ("video" as const) : ("image" as const);
    return {
      durationMs: asset.duration ?? undefined,
      height: asset.height,
      kind,
      mimeType:
        asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
      name: asset.fileName ?? (kind === "video" ? "video.mp4" : "photo.jpg"),
      size: asset.fileSize ?? 0,
      uri: asset.uri,
      width: asset.width,
    } satisfies LocalFile;
  });
}

function storageIdOf(body: unknown) {
  return typeof body === "object" &&
    body !== null &&
    "storageId" in body &&
    typeof body.storageId === "string"
    ? body.storageId
    : undefined;
}

/** Picks files from a source and uploads them, ready to attach. */
export function useAttachmentUploader() {
  const convex = useConvex();

  async function upload(uri: string, mimeType: string) {
    const target = await convex.mutation(api.files.createUpload, {});
    const response = await uploadAsync(target.url, uri, {
      headers: { "Content-Type": mimeType },
      httpMethod: target.method,
      uploadType: FileSystemUploadType.BINARY_CONTENT,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Upload failed (${response.status})`);
    }
    const storageId = storageIdOf(JSON.parse(response.body));
    if (storageId === undefined) throw new Error("Upload failed");
    const { url } = await convex.mutation(api.files.completeUpload, {
      // The server's v.id("_storage") validator checks the format.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      storageId: storageId as Id<"_storage">,
    });
    return url;
  }

  async function uploadFile(file: LocalFile) {
    const url = await upload(file.uri, file.mimeType);
    let thumbnailUrl: string | undefined;
    if (file.kind === "video") {
      const thumbnail = await VideoThumbnails.getThumbnailAsync(file.uri, {
        quality: 0.7,
        time: 0,
      });
      thumbnailUrl = await upload(thumbnail.uri, "image/jpeg");
    }
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

  /** Returns uploaded attachments, or an empty list when cancelled. */
  return async (source: AttachmentSource) => {
    const files = (await pick(source)).slice(0, MAX_ATTACHMENTS);
    return Promise.all(files.map(uploadFile));
  };
}
