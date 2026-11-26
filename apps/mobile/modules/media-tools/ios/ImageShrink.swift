import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers

struct ImageOptions: Record {
  @Field var uri: String = ""
  /// The most the long side may measure, in pixels. Smaller photos keep
  /// their size.
  @Field var maxSide: Int = 2048
  @Field var quality: Double = 0.8
}

/// A photo as a JPEG no bigger than `maxSide`, turned upright, without its
/// metadata (location included).
func shrinkImage(_ options: ImageOptions) throws -> [String: Any] {
  guard let source = CGImageSourceCreateWithURL(fileURL(options.uri) as CFURL, nil) else {
    throw MediaToolsError.noImage
  }
  let thumbnail: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceShouldCacheImmediately: true,
    kCGImageSourceThumbnailMaxPixelSize: options.maxSide,
  ]
  guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnail as CFDictionary)
  else {
    throw MediaToolsError.noImage
  }
  let output = FileManager.default.temporaryDirectory
    .appendingPathComponent("shrunk-\(UUID().uuidString).jpg")
  guard
    let destination = CGImageDestinationCreateWithURL(
      output as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
  else {
    throw MediaToolsError.failed("destination")
  }
  CGImageDestinationAddImage(
    destination, image,
    [kCGImageDestinationLossyCompressionQuality: options.quality] as CFDictionary)
  guard CGImageDestinationFinalize(destination) else {
    throw MediaToolsError.failed("jpeg")
  }
  let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? 0
  return [
    "height": image.height,
    "size": size,
    "uri": output.absoluteString,
    "width": image.width,
  ]
}
