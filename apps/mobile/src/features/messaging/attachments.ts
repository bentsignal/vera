import type { Attachment } from "@decentralized-convex/messages";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api } from "@vera/backend/api";
import { useConvex } from "convex/react";

import { sendUpload } from "./upload-transports";

const MAX_ATTACHMENTS = 10;
const MAX_VIDEO_SECONDS = 120;

/** An upload problem worth showing the person as-is. */
export class AttachmentError extends Error {}

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
    videoMaxDuration: MAX_VIDEO_SECONDS,
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

/** Picks files from a source and uploads them, ready to attach. */
export function useAttachmentUploader() {
  const convex = useConvex();

  async function upload(file: LocalFile) {
    const target = await convex.action(api.files.createUpload, {
      kind: file.kind,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size,
    });
    return sendUpload(convex, target, file);
  }

  async function posterFor(file: LocalFile) {
    const frame = await VideoThumbnails.getThumbnailAsync(file.uri, {
      quality: 0.7,
      time: 0,
    });
    return upload({
      kind: "image",
      mimeType: "image/jpeg",
      name: "poster.jpg",
      size: 0,
      uri: frame.uri,
    });
  }

  async function uploadFile(file: LocalFile) {
    const url = await upload(file);
    const thumbnailUrl =
      file.kind === "video" ? await posterFor(file) : undefined;
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
    if (
      files.some(
        (file) =>
          "durationMs" in file &&
          (file.durationMs ?? 0) > MAX_VIDEO_SECONDS * 1000 + 500,
      )
    ) {
      throw new AttachmentError("Videos can be up to 2 minutes long.");
    }
    return Promise.all(files.map(uploadFile));
  };
}
