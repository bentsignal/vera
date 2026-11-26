import AVFoundation
import ExpoModulesCore
import VideoToolbox

struct VideoOptions: Record {
  /// Names this job in its `onProgress` events.
  @Field var id: String = ""
  @Field var uri: String = ""
  /// The video's target bits per second.
  @Field var bitrate: Int = 6_000_000
  /// The most the long and short sides may measure, in pixels.
  @Field var maxLongSide: Int = 1920
  @Field var maxShortSide: Int = 1080
}

enum MediaToolsError: Error {
  case noVideo
  case noImage
  case failed(String)
}

func fileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.scheme != nil { return url }
  return URL(fileURLWithPath: uri)
}

private func even(_ value: CGFloat) -> Int {
  max(2, Int((value / 2).rounded()) * 2)
}

/// Re-encodes a video smaller: HEVC at the bitrate asked for, no bigger
/// than 1080p, keeping HDR, rotation and the sound as they are.
func shrinkVideo(
  _ options: VideoOptions,
  onProgress: @escaping (Double) -> Void
) async throws -> [String: Any] {
  let asset = AVURLAsset(url: fileURL(options.uri))
  guard let video = try await asset.loadTracks(withMediaType: .video).first else {
    throw MediaToolsError.noVideo
  }
  let (naturalSize, transform, frameRate, formats) = try await video.load(
    .naturalSize, .preferredTransform, .nominalFrameRate, .formatDescriptions)
  let duration = try await asset.load(.duration).seconds
  let audio = try await asset.loadTracks(withMediaType: .audio).first

  let width = abs(naturalSize.width)
  let height = abs(naturalSize.height)
  let scale = min(
    1,
    CGFloat(options.maxLongSide) / max(width, height),
    CGFloat(options.maxShortSide) / min(width, height))
  let outWidth = even(width * scale)
  let outHeight = even(height * scale)

  // HDR (HLG or PQ, as iPhones record by default) stays HDR: 10-bit in,
  // HEVC Main10 out, with the source's color tags.
  let extensions = formats.first.flatMap { CMFormatDescriptionGetExtensions($0) as? [String: Any] } ?? [:]
  let transfer = extensions[kCVImageBufferTransferFunctionKey as String] as? String
  let hdr =
    transfer == (kCVImageBufferTransferFunction_ITU_R_2100_HLG as String)
    || transfer == (kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ as String)

  let output = FileManager.default.temporaryDirectory
    .appendingPathComponent("shrunk-\(UUID().uuidString).mp4")
  let reader = try AVAssetReader(asset: asset)
  let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
  writer.shouldOptimizeForNetworkUse = true

  let videoOutput = AVAssetReaderTrackOutput(
    track: video,
    outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: hdr
        ? kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange
        : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    ])
  videoOutput.alwaysCopiesSampleData = false
  reader.add(videoOutput)

  var compression: [String: Any] = [
    AVVideoAverageBitRateKey: options.bitrate,
    AVVideoExpectedSourceFrameRateKey: frameRate > 0 ? frameRate : 30,
    AVVideoMaxKeyFrameIntervalDurationKey: 2,
  ]
  if hdr {
    compression[AVVideoProfileLevelKey] = kVTProfileLevel_HEVC_Main10_AutoLevel as String
  }
  var videoSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.hevc,
    AVVideoWidthKey: outWidth,
    AVVideoHeightKey: outHeight,
    AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
    AVVideoCompressionPropertiesKey: compression,
  ]
  if let primaries = extensions[kCVImageBufferColorPrimariesKey as String] as? String,
    let transfer,
    let matrix = extensions[kCVImageBufferYCbCrMatrixKey as String] as? String
  {
    videoSettings[AVVideoColorPropertiesKey] = [
      AVVideoColorPrimariesKey: primaries,
      AVVideoTransferFunctionKey: transfer,
      AVVideoYCbCrMatrixKey: matrix,
    ]
  }
  let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
  videoInput.transform = transform
  videoInput.expectsMediaDataInRealTime = false
  writer.add(videoInput)

  // The sound is copied as it is (phones record AAC, which MP4 takes).
  var audioPair: (AVAssetReaderTrackOutput, AVAssetWriterInput)?
  if let audio {
    let audioFormat = try await audio.load(.formatDescriptions).first
    let audioOutput = AVAssetReaderTrackOutput(track: audio, outputSettings: nil)
    let audioInput = AVAssetWriterInput(
      mediaType: .audio, outputSettings: nil, sourceFormatHint: audioFormat)
    audioInput.expectsMediaDataInRealTime = false
    if reader.canAdd(audioOutput), writer.canAdd(audioInput) {
      reader.add(audioOutput)
      writer.add(audioInput)
      audioPair = (audioOutput, audioInput)
    }
  }

  guard reader.startReading() else {
    throw MediaToolsError.failed(reader.error?.localizedDescription ?? "reader")
  }
  guard writer.startWriting() else {
    throw MediaToolsError.failed(writer.error?.localizedDescription ?? "writer")
  }
  writer.startSession(atSourceTime: .zero)

  let group = DispatchGroup()
  var lastReported = -1.0
  func pump(
    _ output: AVAssetReaderTrackOutput, _ input: AVAssetWriterInput, label: String,
    reports: Bool
  ) {
    group.enter()
    let queue = DispatchQueue(label: "chat.vera.videoshrink.\(label)")
    input.requestMediaDataWhenReady(on: queue) {
      while input.isReadyForMoreMediaData {
        guard reader.status == .reading, let sample = output.copyNextSampleBuffer() else {
          input.markAsFinished()
          group.leave()
          return
        }
        if reports, duration > 0 {
          let fraction = min(1, CMSampleBufferGetPresentationTimeStamp(sample).seconds / duration)
          if fraction - lastReported >= 0.02 {
            lastReported = fraction
            onProgress(fraction)
          }
        }
        if !input.append(sample) {
          reader.cancelReading()
        }
      }
    }
  }
  pump(videoOutput, videoInput, label: "video", reports: true)
  if let (audioOutput, audioInput) = audioPair {
    pump(audioOutput, audioInput, label: "audio", reports: false)
  }

  await withCheckedContinuation { continuation in
    group.notify(queue: .global()) { continuation.resume() }
  }
  if reader.status == .failed || writer.status == .failed {
    writer.cancelWriting()
    try? FileManager.default.removeItem(at: output)
    throw MediaToolsError.failed(
      (writer.error ?? reader.error)?.localizedDescription ?? "unknown")
  }
  await writer.finishWriting()
  guard writer.status == .completed else {
    try? FileManager.default.removeItem(at: output)
    throw MediaToolsError.failed(writer.error?.localizedDescription ?? "unfinished")
  }

  let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? 0
  // Width and height as the video displays, after rotation.
  let rotated = CGRect(x: 0, y: 0, width: outWidth, height: outHeight).applying(transform)
  return [
    "height": Int(abs(rotated.height)),
    "size": size,
    "uri": output.absoluteString,
    "width": Int(abs(rotated.width)),
  ]
}
