import SDWebImage
import UIKit

// Images through SDWebImage (expo-image bundles it, so it's already in the
// app): downloaded, downsampled to the size they're drawn at, and decoded
// off the main thread, then kept decoded in memory, so a recycled cell
// shows an image it has seen at once.

enum Images {
  static let scale = UIScreen.main.scale

  static func context(_ size: CGSize, blur: CGFloat = 0) -> [SDWebImageContextOption: Any] {
    var context: [SDWebImageContextOption: Any] = [
      .imageThumbnailPixelSize: CGSize(width: ceil(size.width * scale), height: ceil(size.height * scale)),
    ]
    // Blurred once, off the main thread, and cached that way.
    if blur > 0 { context[.imageTransformer] = SDImageBlurTransformer(radius: blur * scale) }
    return context
  }

  static let options: SDWebImageOptions = [.retryFailed, .decodeFirstFrameOnly]

  /// The image a view shows or is loading (its URL and blur), so setting
  /// it again doesn't load it again. Not `sd_imageURL`: SDWebImage keeps
  /// that after a load fails or the view shows a placeholder instead, and a
  /// recycled cell would then keep the placeholder (another person's
  /// initials) when the URL came back.
  private static let shownKey = "veraShown"

  /// Shows `url` in `view`, sized for `size`. Images already in memory show
  /// at once; downloaded ones fade in.
  static func load(_ view: UIImageView, _ url: URL?, size: CGSize, placeholder: UIImage? = nil, blur: CGFloat = 0) {
    guard let url else {
      cancel(view)
      view.image = placeholder
      return
    }
    let shown = "\(blur)|\(url.absoluteString)"
    if view.layer.value(forKey: shownKey) as? String == shown, view.image != nil { return }
    view.layer.setValue(shown, forKey: shownKey)
    view.sd_imageTransition = .fade(duration: 0.18)
    view.sd_setImage(with: url, placeholderImage: placeholder, options: options, context: context(size, blur: blur), progress: nil) { [weak view] image, error, _, _ in
      // Failed: the placeholder stays, and setting it again tries again.
      // (A load replaced by another is cancelled, and that one's showing.)
      guard image == nil, (error as NSError?)?.code != SDWebImageError.cancelled.rawValue,
            let view, view.layer.value(forKey: shownKey) as? String == shown else { return }
      view.layer.setValue(nil, forKey: shownKey)
    }
  }

  static func cancel(_ view: UIImageView) {
    view.sd_cancelCurrentImageLoad()
    view.layer.setValue(nil, forKey: shownKey)
  }

  private static let prefetcher: SDWebImagePrefetcher = {
    let prefetcher = SDWebImagePrefetcher()
    prefetcher.maxConcurrentPrefetchCount = 6
    return prefetcher
  }()

  /// Downloads and decodes images about to show, at the sizes they'll show.
  static func prefetch(_ requests: [(URL, CGSize)]) {
    for (url, size) in requests {
      prefetcher.prefetchURLs([url], options: options, context: context(size), progress: nil, completed: nil)
    }
  }
}

/// A round photo, or initials on a gradient when there's none.
final class AvatarView: UIImageView {
  private var monogramColors: (UIColor, UIColor) = (.gray, .darkGray)
  private static let monograms = NSCache<NSString, UIImage>()

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    contentMode = .scaleAspectFill
    isUserInteractionEnabled = false
  }

  convenience init() { self.init(frame: .zero) }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    layer.cornerRadius = bounds.width / 2
  }

  func set(_ person: Person, size: CGFloat, theme: Theme, ring: CGFloat = 0) {
    layer.borderWidth = ring
    layer.borderColor = theme.background.cgColor
    layer.cornerRadius = size / 2
    let monogram = Self.monogram(person.initials, size: size, top: theme.monogramTop, bottom: theme.monogramBottom)
    // `load` skips a photo already showing or loading, and tries again
    // after one that failed.
    Images.load(self, person.avatarUrl, size: CGSize(width: size, height: size), placeholder: monogram)
  }

  static func monogram(_ initials: String, size: CGFloat, top: UIColor, bottom: UIColor) -> UIImage {
    let key = "\(initials)|\(size)|\(top.hashValue)|\(bottom.hashValue)" as NSString
    if let image = monograms.object(forKey: key) { return image }
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
    let image = renderer.image { context in
      let colors = [top.cgColor, bottom.cgColor] as CFArray
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
        context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size), options: [])
      }
      let fontSize = size <= 18 ? 8 : size <= 28 ? 12 : size <= 36 ? 13 : size * 0.36
      let text = NSAttributedString(string: initials.uppercased(), attributes: [
        .font: UIFont.systemFont(ofSize: fontSize, weight: .semibold),
        .foregroundColor: UIColor.white,
      ])
      let textSize = text.size()
      text.draw(at: CGPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2))
    }
    monograms.setObject(image, forKey: key)
    return image
  }
}

/// A typing face, as typing-parts.tsx `Faces` draws one: the photo (or
/// monogram) at its own size, `xs` 18 or `sm` 28, inside a ring in the
/// page's color that sets it off from the face under it. The ring sits
/// around the photo, never over it, so initials keep their size and fit.
final class RingedAvatarView: UIView {
  private let avatar = AvatarView()
  private var ring: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    addSubview(avatar)
  }

  convenience init() { self.init(frame: .zero) }

  required init?(coder: NSCoder) { fatalError() }

  /// `size` is the photo's; the view is `ring` larger on every side.
  func set(_ person: Person, size: CGFloat, theme: Theme, ring: CGFloat) {
    self.ring = ring
    backgroundColor = theme.background
    layer.cornerRadius = size / 2 + ring
    avatar.set(person, size: size, theme: theme)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layer.cornerRadius = bounds.width / 2
    avatar.frame = bounds.insetBy(dx: ring, dy: ring)
  }
}
