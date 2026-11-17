import type {
  OpenCropperOptions,
  OpenCropperResult,
} from "@bsky.app/expo-image-crop-tool";
import type { ImagePickerAsset } from "expo-image-picker";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

// The crop screen a profile photo opens in on iOS once the picker
// closes. The picker's own editor makes expo-image-picker use the old
// UIImagePickerController, which loads the whole library before it
// appears (about five seconds); without it the system picker opens at
// once. Android keeps the picker's editor, so the module isn't linked
// there (`expo.autolinking` in package.json). It's loaded optionally: a
// build made before it was added crops camera photos in the picker and
// leaves library photos as they are.

interface CropToolModule {
  openCropperAsync: (options: OpenCropperOptions) => Promise<OpenCropperResult>;
}

const cropTool =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<CropToolModule>("ExpoImageCropTool")
    : null;

/** Whether profile photos go through the crop screen after the picker. */
export const cropsAfterPicking = cropTool !== null;

/** Whether a profile photo from `source` crops in the picker's editor. */
export function cropsInPicker(source: "camera" | "library") {
  if (cropsAfterPicking) return false;
  return source === "camera" || Platform.OS === "android";
}

function cancelled(error: unknown) {
  return error instanceof Error && /cancel/i.test(error.message);
}

/**
 * The part of `asset` the person keeps from the crop screen, as a JPEG,
 * or nothing when they cancel. Without the crop screen, `asset` itself.
 */
export async function cropPhoto(asset: ImagePickerAsset) {
  if (cropTool === null) return asset;
  const result = await cropTool
    .openCropperAsync({
      aspectRatio: 1,
      compressImageQuality: 0.7,
      format: "jpeg",
      imageUri: asset.uri,
      rotationControlEnabled: false,
      shape: "circle",
    })
    .catch((error: unknown) => {
      if (cancelled(error)) return undefined;
      throw error;
    });
  if (result === undefined) return undefined;
  return {
    ...asset,
    fileName: "photo.jpg",
    fileSize: result.size,
    height: result.height,
    mimeType: result.mimeType,
    uri: result.path,
    width: result.width,
  } satisfies ImagePickerAsset;
}
