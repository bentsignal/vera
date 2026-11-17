import type { Attachment } from "@decentralized-convex/messages";
import { Alert, Linking } from "react-native";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { getInfoAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api } from "@vera/backend/api";
import {
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_SECONDS,
} from "@vera/backend/upload-limits";
import { ConvexError } from "convex/values";

import type { AccountSession } from "~/features/session/account-session";
import type { PastedImage } from "~/lib/paste-images";
import { formatBytes } from "~/lib/format";
import { useAccount } from "./account";
import { cropPhoto, cropsAfterPicking, cropsInPicker } from "./crop-photo";
import { sendUpload } from "./upload-transports";

/** The most attachments one message can carry (the PDS's limit too). */
export const MAX_ATTACHMENTS = 10;

export type AttachmentSource = "camera" | "files" | "library";

/** A local file, sized and ready to upload. */
interface LocalFile {
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
  readonly uri: string;
}

/**
 * Something picked for a message that hasn't been sent yet. Nothing is
 * uploaded until the message is sent.
 */
export interface StagedFile extends LocalFile {
  readonly id: string;
  readonly kind: Attachment["kind"];
  readonly durationMs?: number;
  readonly height?: number;
  readonly width?: number;
  /** A video's first frame, shown while staged and uploaded as its poster. */
  readonly poster?: LocalFile;
}

/** An upload problem worth showing the person as-is. */
export class AttachmentError extends Error {}

/** The PDS turned the file away for its size, so retrying won't help. */
export class TooLargeError extends AttachmentError {}

const KIND_NOUN = { file: "file", image: "photo", video: "video" } as const;

function limitsSentence() {
  return `You can send videos up to ${formatBytes(MAX_UPLOAD_BYTES.video)}, photos up to ${formatBytes(MAX_UPLOAD_BYTES.image)}, and other files up to ${formatBytes(MAX_UPLOAD_BYTES.file)}.`;
}

/** The file's real length on disk; pickers sometimes report none. */
async function sizeOf(uri: string, reported: number | null | undefined) {
  const info = await getInfoAsync(uri).catch(() => undefined);
  if (info?.exists === true && info.size > 0) return info.size;
  return reported ?? 0;
}

async function posterFor(uri: string) {
  const frame = await VideoThumbnails.getThumbnailAsync(uri, {
    quality: 0.7,
    time: 0,
  }).catch(() => undefined);
  if (frame === undefined) return undefined;
  return {
    mimeType: "image/jpeg",
    name: "poster.jpg",
    size: await sizeOf(frame.uri, 0),
    uri: frame.uri,
  } satisfies LocalFile;
}

async function fromDocument(asset: DocumentPicker.DocumentPickerAsset) {
  return {
    id: Crypto.randomUUID(),
    kind: "file",
    mimeType: asset.mimeType ?? "application/octet-stream",
    name: asset.name,
    size: await sizeOf(asset.uri, asset.size),
    uri: asset.uri,
  } satisfies StagedFile;
}

async function fromMedia(asset: ImagePicker.ImagePickerAsset) {
  const kind = asset.type === "video" ? "video" : "image";
  const [size, poster] = await Promise.all([
    sizeOf(asset.uri, asset.fileSize),
    kind === "video" ? posterFor(asset.uri) : undefined,
  ]);
  return {
    durationMs: asset.duration ?? undefined,
    height: asset.height,
    id: Crypto.randomUUID(),
    kind,
    mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
    name: asset.fileName ?? (kind === "video" ? "video.mp4" : "photo.jpg"),
    poster,
    size,
    uri: asset.uri,
    width: asset.width,
  } satisfies StagedFile;
}

async function cameraAllowed() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.granted) return true;
  Alert.alert(
    "Camera Access Is Off",
    "Allow camera access in Settings to take photos and videos here.",
    [
      { style: "cancel", text: "Not Now" },
      { onPress: () => void Linking.openSettings(), text: "Open Settings" },
    ],
  );
  return false;
}

/** A video longer than the app sends, allowing for rounding. */
function tooLong(asset: ImagePicker.ImagePickerAsset) {
  return (
    asset.type === "video" &&
    (asset.duration ?? 0) > MAX_VIDEO_SECONDS * 1000 + 500
  );
}

function videoLimit() {
  const minutes = MAX_VIDEO_SECONDS / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

const TOO_LONG = {
  message: `Videos can be up to ${videoLimit()} long.`,
  title: "Video Too Long",
};

/** What a picker handed back, and why anything was left out. */
function picked(
  files: StagedFile[],
  problem?: { message: string; title: string },
) {
  return { files, problem };
}

function mediaOptions(
  source: "camera" | "library",
  limit: number,
  imagesOnly: boolean,
) {
  return {
    allowsMultipleSelection: source === "library" && !imagesOnly,
    allowsEditing: imagesOnly && cropsInPicker(source),
    aspect: [1, 1],
    mediaTypes: imagesOnly ? ["images"] : ["images", "videos"],
    orderedSelection: true,
    // iOS hands over the library's own file instead of converting it.
    // Turning an HEVC video into H.264 takes many seconds for a long
    // video, and it ran before the app could see the video was too long
    // to send. iPhones and Android 9 or later show HEIC photos and play
    // HEVC videos. A profile photo is saved again as a JPEG, by the crop
    // screen or, when the picker crops it, by a quality under 1.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    quality: imagesOnly ? (cropsAfterPicking ? 1 : 0.7) : 0.8,
    selectionLimit: limit,
    // The camera stops recording here.
    videoMaxDuration: MAX_VIDEO_SECONDS,
  } satisfies ImagePicker.ImagePickerOptions;
}

/** A profile photo, through the crop screen when it has one. */
async function pickedPhoto(asset: ImagePicker.ImagePickerAsset | undefined) {
  const kept = asset && (await cropPhoto(asset));
  return picked(kept ? [await fromMedia(kept)] : []);
}

async function pickMedia(
  source: "camera" | "library",
  limit: number,
  imagesOnly: boolean,
) {
  if (source === "camera" && !(await cameraAllowed())) return picked([]);
  const options = mediaOptions(source, limit, imagesOnly);
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return picked([]);
  if (imagesOnly) return pickedPhoto(result.assets[0]);
  // Turned away before anything else is read from them, such as a poster
  // frame, so the alert comes up as the picker closes.
  const sendable = result.assets.filter((asset) => !tooLong(asset));
  return picked(
    await Promise.all(sendable.map(fromMedia)),
    sendable.length < result.assets.length ? TOO_LONG : undefined,
  );
}

async function pickFiles() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return picked([]);
  return picked(await Promise.all(result.assets.map(fromDocument)));
}

/** Why a picked file can't be sent, in words for the person. */
function problemWith(file: StagedFile) {
  if (file.size > MAX_UPLOAD_BYTES[file.kind]) {
    return {
      message: `This ${KIND_NOUN[file.kind]} is ${formatBytes(file.size)}. ${limitsSentence()}`,
      title: "Too Big to Send",
    };
  }
  return undefined;
}

/**
 * Opens a picker and returns what was picked, ready to stage. Nothing is
 * uploaded. Files that can't be sent are left out with an alert saying
 * why; cancelling returns an empty list.
 */
export async function pickAttachments(
  source: AttachmentSource,
  { limit = MAX_ATTACHMENTS, imagesOnly = false } = {},
) {
  const result = await (
    source === "files" ? pickFiles() : pickMedia(source, limit, imagesOnly)
  ).catch(() => {
    Alert.alert("Couldn't Add That", "Try picking it again.");
    return picked([]);
  });
  return sendableOf(result, limit);
}

/**
 * Up to `limit` of the files that can be sent, with an alert for the rest
 * saying why they were left out.
 */
function sendableOf(
  { files, problem: pickProblem }: ReturnType<typeof picked>,
  limit: number,
) {
  const problems = files.map(problemWith);
  const firstProblem =
    pickProblem ?? problems.find((problem) => problem !== undefined);
  const sendable = files.filter((_, index) => problems[index] === undefined);
  if (firstProblem !== undefined) {
    Alert.alert(firstProblem.title, firstProblem.message);
  } else if (sendable.length > limit) {
    Alert.alert(
      "Too Many Attachments",
      `You can send up to ${MAX_ATTACHMENTS} at a time.`,
    );
  }
  return sendable.slice(0, limit);
}

/**
 * Photos pasted into the message field, ready to stage like picked ones.
 * Those too big to send are left out with an alert.
 */
export function stagePasted(images: readonly PastedImage[], limit: number) {
  const files = images.map(
    (image) =>
      ({
        ...image,
        id: Crypto.randomUUID(),
        kind: "image",
      }) satisfies StagedFile,
  );
  return sendableOf(picked(files), limit);
}

function errorCode(data: unknown) {
  return typeof data === "object" && data !== null && "code" in data
    ? data.code
    : undefined;
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
      if (
        error instanceof ConvexError &&
        errorCode(error.data) === "UPLOAD_TOO_LARGE"
      ) {
        throw new TooLargeError(limitsSentence());
      }
      throw error;
    });
  return sendUpload(convex, target, file, onBytesSent);
}

/**
 * Uploads a staged file (and a video's poster), reporting progress from 0
 * to 1, and returns the attachment to send. A poster that fails to upload
 * is left off; the conversation draws one from the video instead.
 */
export async function uploadStaged(
  session: AccountSession,
  file: StagedFile,
  onProgress: (fraction: number) => void = () => undefined,
) {
  const posterSize = file.poster?.size ?? 0;
  const total = Math.max(1, file.size + posterSize);
  const url = await uploadOne(session, file.kind, file, (bytes) =>
    onProgress(Math.min(bytes, file.size) / total),
  );
  const thumbnailUrl =
    file.poster === undefined
      ? undefined
      : await uploadOne(session, "image", file.poster, (bytes) =>
          onProgress((file.size + Math.min(bytes, posterSize)) / total),
        ).catch(() => undefined);
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

/** Picks and uploads right away, for a profile photo. */
export function useAttachmentUploader() {
  const { session } = useAccount();
  /**
   * Returns uploaded attachments, or an empty list when cancelled.
   * `onPicked` gets the local files before they upload, to show them
   * right away.
   */
  return async (
    source: "camera" | "library",
    {
      imagesOnly = false,
      onPicked,
    }: {
      imagesOnly?: boolean;
      onPicked?: (files: readonly StagedFile[]) => void;
    } = {},
  ) => {
    const files = await pickAttachments(source, { imagesOnly, limit: 1 });
    if (files.length > 0) onPicked?.(files);
    return Promise.all(files.map((file) => uploadStaged(session, file)));
  };
}
