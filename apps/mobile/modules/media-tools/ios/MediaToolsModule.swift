import ExpoModulesCore

/// Vera's media tools: shrinking photos and videos before they're sent,
/// and showing a file in the system's viewer. The app loads it optionally,
/// so builds without it send media as picked and open files in a browser.
public class MediaToolsModule: Module {
  private let preview = FilePreview()

  public func definition() -> ModuleDefinition {
    Name("VeraMediaTools")
    Events("onProgress")

    AsyncFunction("shrinkVideoAsync") { (options: VideoOptions, promise: Promise) in
      Task {
        do {
          let result = try await shrinkVideo(options) { [weak self] fraction in
            self?.sendEvent("onProgress", ["id": options.id, "fraction": fraction])
          }
          promise.resolve(result)
        } catch {
          promise.reject("ERR_VIDEO_SHRINK", "\(error)")
        }
      }
    }

    AsyncFunction("shrinkImageAsync") { (options: ImageOptions) -> [String: Any] in
      try shrinkImage(options)
    }

    AsyncFunction("previewFileAsync") { (uri: String, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(false)
        return
      }
      self.preview.show(fileURL(uri), from: presenter)
      promise.resolve(true)
    }.runOnQueue(.main)

    AsyncFunction("beginPreviewAsync") { (title: String) -> Bool in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        return false
      }
      self.preview.begin(title: title, from: presenter)
      return true
    }.runOnQueue(.main)

    AsyncFunction("cancelPreviewAsync") {
      self.preview.cancel()
    }.runOnQueue(.main)
  }
}
