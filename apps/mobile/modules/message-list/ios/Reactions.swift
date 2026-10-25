import UIKit

// Reactions are data: native draws any emoji (as text) or image with its
// count, never knowing which reactions exist. Tapbacks sit over a bubble's
// top corner; chips go under stacked messages. Both pop in and shrink out.

protocol ReactionView: UIView {
  var reactionId: String { get }
}

enum Pop {
  /// 0% scale .3 → 60% scale `overshoot`, opaque → 100% scale 1.
  static func popIn(_ view: UIView, duration: Double, overshoot: CGFloat, delay: Double = 0) {
    let scale = CAKeyframeAnimation(keyPath: "transform.scale")
    scale.values = [0.3, overshoot, 1]
    scale.keyTimes = [0, 0.6, 1]
    let opacity = CAKeyframeAnimation(keyPath: "opacity")
    opacity.values = [0, 1, 1]
    opacity.keyTimes = [0, 0.6, 1]
    let group = CAAnimationGroup()
    group.animations = [scale, opacity]
    group.duration = duration
    group.beginTime = CACurrentMediaTime() + delay
    group.fillMode = .backwards
    view.layer.add(group, forKey: "pop")
  }

  static func popOut(_ view: UIView, duration: Double) {
    view.isUserInteractionEnabled = false
    UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseIn, .beginFromCurrentState]) {
      view.transform = CGAffineTransform(scaleX: 0.01, y: 0.01)
      view.alpha = 0
    } completion: { _ in
      view.removeFromSuperview()
      view.transform = .identity
      view.alpha = 1
    }
  }
}

final class TapbackView: UIView, ReactionView {
  private(set) var reactionId = ""
  private(set) var layout: TapbackLayout?
  private let emoji = UILabel()
  private let image = UIImageView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    emoji.textAlignment = .center
    emoji.font = .systemFont(ofSize: 18)
    image.contentMode = .scaleAspectFit
    addSubview(emoji)
    addSubview(image)
    layer.borderWidth = 1
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ layout: TapbackLayout, theme: Theme) {
    self.layout = layout
    reactionId = layout.id
    backgroundColor = layout.tinted ? theme.bubbleOutgoing : theme.bubbleIncoming
    layer.borderColor = theme.background.cgColor
    layer.cornerRadius = layout.frame.width / 2
    if let url = layout.reaction.imageUrl {
      emoji.isHidden = true
      image.isHidden = false
      Images.load(image, url, size: CGSize(width: 22, height: 22))
    } else {
      emoji.isHidden = false
      image.isHidden = true
      emoji.text = layout.reaction.emoji ?? layout.reaction.label
    }
    accessibilityLabel = layout.reaction.label
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    emoji.frame = bounds.offsetBy(dx: 0.45, dy: 0)
    image.frame = bounds.insetBy(dx: 6, dy: 6)
  }
}

/// What a stacked chip is drawn with. The React Native list's chips were
/// glass (`GlassSurface`). Chips sit on the conversation's plain
/// background, where a live backdrop shows little but its rim and tint,
/// so `sheen` draws those as a stretchable image made once per look: no
/// backdrop and no offscreen pass, so structurally it's drawn like a
/// fill. Its actual cost hasn't been measured. `glass` is the
/// system's live glass (iOS 26, a blur before), `fill` a flat color. The
/// app's `VeraChipMaterial` default picks one at launch, for comparisons.
enum ChipMaterial: String {
  case sheen, glass, fill

  static let current = UserDefaults.standard.string(forKey: "VeraChipMaterial").flatMap(ChipMaterial.init) ?? standard

  /// Glass where it was measured: on iOS 26 and later its slow frames
  /// stayed within the noise of fill's, flinging the busy stacked chat in
  /// the simulator (six interleaved runs, 2026-10-23). Before iOS 26,
  /// glass falls back to a blur that wasn't measured, so it's fill there.
  static var standard: ChipMaterial {
    if #available(iOS 26.0, *) { return .glass }
    return .fill
  }
}

final class ChipView: UIView, ReactionView {
  private(set) var reactionId = ""
  private(set) var layout: ChipLayout?
  private let text = TextView()
  private let image = UIImageView()
  private let material = UIImageView()
  private var glass: UIVisualEffectView?

  override init(frame: CGRect) {
    super.init(frame: frame)
    image.contentMode = .scaleAspectFit
    material.isUserInteractionEnabled = false
    if ChipMaterial.current == .sheen { addSubview(material) }
    addSubview(text)
    addSubview(image)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ layout: ChipLayout, theme: Theme) {
    self.layout = layout
    reactionId = layout.id
    layer.cornerRadius = Metrics.chipHeight / 2
    let tint = layout.reaction.mine ? theme.accent.withAlphaComponent(0.2) : theme.fill
    switch ChipMaterial.current {
    case .fill:
      backgroundColor = tint
    case .sheen:
      backgroundColor = nil
      material.image = Sheen.image(tint: tint, background: theme.background)
    case .glass:
      backgroundColor = nil
      setGlass(tint: layout.reaction.mine ? theme.accent.withAlphaComponent(0.25) : nil)
    }
    text.text = layout.text.string
    text.frame = layout.text.frame
    if let url = layout.reaction.imageUrl {
      image.isHidden = false
      image.frame = CGRect(x: 8, y: (Metrics.chipHeight - 16) / 2, width: 16, height: 16)
      Images.load(image, url, size: CGSize(width: 16, height: 16))
    } else {
      image.isHidden = true
    }
    accessibilityLabel = "\(layout.reaction.label) \(layout.reaction.count)"
  }

  private func setGlass(tint: UIColor?) {
    let view: UIVisualEffectView
    if let glass {
      view = glass
    } else {
      view = UIVisualEffectView(effect: nil)
      view.isUserInteractionEnabled = false
      view.clipsToBounds = true
      view.layer.cornerRadius = Metrics.chipHeight / 2
      insertSubview(view, at: 0)
      glass = view
    }
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect()
      effect.tintColor = tint
      view.effect = effect
    } else {
      view.effect = UIBlurEffect(style: .systemUltraThinMaterial)
      view.backgroundColor = tint
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    material.frame = bounds.insetBy(dx: -Sheen.pad, dy: -Sheen.pad)
    glass?.frame = bounds
  }
}

/// `ChipMaterial.sheen`: a capsule in the chip's tint with glass's rim (a
/// hairline brighter at the top) and a soft shadow, drawn once per tint
/// and stretched to each chip's width.
enum Sheen {
  /// Room around the capsule for its shadow.
  static let pad: CGFloat = 4
  private static let cache = NSCache<NSString, UIImage>()

  static func image(tint: UIColor, background: UIColor) -> UIImage {
    let dark = background.luminance < 0.5
    let key = "\(tint.hashValue)|\(dark)|\(UIScreen.main.scale)" as NSString
    if let image = cache.object(forKey: key) { return image }
    let height = Metrics.chipHeight
    let capsule = CGRect(x: pad, y: pad, width: height + 2, height: height)
    let size = CGSize(width: capsule.width + pad * 2, height: height + pad * 2)
    let drawn = UIGraphicsImageRenderer(size: size).image { context in
      let cg = context.cgContext
      let path = UIBezierPath(roundedRect: capsule, cornerRadius: height / 2)
      cg.saveGState()
      cg.setShadow(offset: CGSize(width: 0, height: 1), blur: 3, color: UIColor.black.withAlphaComponent(dark ? 0.35 : 0.10).cgColor)
      // The shadow needs something opaque under the tint to fall from.
      background.withAlphaComponent(dark ? 0.6 : 0.9).setFill()
      path.fill()
      cg.restoreGState()
      tint.setFill()
      path.fill()
      // The rim: a hairline, brightest along the top.
      let rim = path.cgPath.copy(strokingWithWidth: 1, lineCap: .round, lineJoin: .round, miterLimit: 1)
      cg.saveGState()
      cg.addPath(rim)
      cg.clip()
      let top = UIColor.white.withAlphaComponent(dark ? 0.32 : 0.85).cgColor
      let bottom = UIColor.white.withAlphaComponent(dark ? 0.06 : 0.25).cgColor
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [top, bottom] as CFArray, locations: [0, 1]) {
        cg.drawLinearGradient(gradient, start: CGPoint(x: 0, y: capsule.minY), end: CGPoint(x: 0, y: capsule.maxY), options: [])
      }
      cg.restoreGState()
    }
    let inset = pad + height / 2
    let image = drawn.resizableImage(withCapInsets: UIEdgeInsets(top: inset, left: inset, bottom: inset, right: inset), resizingMode: .stretch)
    cache.setObject(image, forKey: key)
    return image
  }
}

extension UIColor {
  /// Relative brightness, 0 (black) to 1 (white).
  var luminance: CGFloat {
    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
    guard getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return 1 }
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
}

/// Keeps a set of reaction views in step with their layouts: new ones pop
/// in, gone ones shrink out, and the rest move (inside the caller's
/// animation, if any).
final class ReactionPool<View: UIView & ReactionView> {
  private(set) var views: [String: View] = [:]
  private var spare: [View] = []

  func update<Layout>(
    _ layouts: [Layout],
    id: (Layout) -> String,
    frame: (Layout) -> CGRect,
    in container: UIView,
    animated: Bool,
    make: () -> View,
    set: (View, Layout) -> Void,
    popIn: (View) -> Void,
    popOut: (View) -> Void
  ) {
    var next: [String: View] = [:]
    for layout in layouts {
      let key = id(layout)
      if let view = views.removeValue(forKey: key) {
        set(view, layout)
        // bounds and center: it may be shrunk under a finger.
        Self.place(view, frame(layout))
        next[key] = view
      } else {
        let view = spare.popLast() ?? make()
        view.layer.removeAllAnimations()
        view.transform = .identity
        view.alpha = 1
        view.isUserInteractionEnabled = true
        UIView.performWithoutAnimation {
          set(view, layout)
          Self.place(view, frame(layout))
        }
        container.addSubview(view)
        next[key] = view
        if animated { popIn(view) }
      }
    }
    for (_, view) in views {
      if animated {
        popOut(view)
      } else {
        view.removeFromSuperview()
        spare.append(view)
      }
    }
    views = next
  }

  private static func place(_ view: UIView, _ frame: CGRect) {
    view.bounds = CGRect(origin: .zero, size: frame.size)
    view.center = CGPoint(x: frame.midX, y: frame.midY)
  }

  func bringToFront(order: [String]) {
    for key in order {
      if let view = views[key] { view.superview?.bringSubviewToFront(view) }
    }
  }
}
