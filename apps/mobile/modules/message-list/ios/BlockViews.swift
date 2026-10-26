import UIKit

// The views a message is built from: text, bubbles (with the tail), file
// rows, link cards, and quotes. Each is set from a precomputed layout, so
// configuring one is setting frames and content.

/// Draws attributed text exactly the way `measure` sized it.
final class TextView: UIView {
  var text: NSAttributedString? {
    didSet {
      if text !== oldValue { setNeedsDisplay() }
    }
  }

  override var bounds: CGRect {
    didSet {
      if bounds.size != oldValue.size { setNeedsDisplay() }
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = false
    backgroundColor = .clear
    // Drawn at its final size and pinned top-left while a frame animates,
    // never stretched.
    contentMode = .topLeft
    isUserInteractionEnabled = false
    // Core Animation replays the drawing off the main thread.
    layer.drawsAsynchronously = true
  }

  required init?(coder: NSCoder) { fatalError() }

  override func draw(_ rect: CGRect) {
    guard let text, text.length > 0 else { return }
    // A fixed line height puts its extra space above the glyphs: half of it
    // goes below instead, so the text sits in the middle of its lines.
    var lift: CGFloat = 0
    if let font = text.attribute(.font, at: 0, effectiveRange: nil) as? UIFont,
       let paragraph = text.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle,
       paragraph.maximumLineHeight > font.lineHeight {
      lift = (paragraph.maximumLineHeight - font.lineHeight) / 2
    }
    let area = CGRect(x: 0, y: -lift, width: bounds.width, height: bounds.height + lift)
    text.draw(with: area, options: [.usesLineFragmentOrigin, .usesFontLeading, .truncatesLastVisibleLine], context: nil)
  }

  /// The index of the link or mention span at a point, if any.
  func spanIndex(at point: CGPoint) -> Int? {
    guard let text, bounds.contains(point) else { return nil }
    let storage = NSTextStorage(attributedString: text)
    let manager = NSLayoutManager()
    let container = NSTextContainer(size: CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
    container.lineFragmentPadding = 0
    manager.addTextContainer(container)
    storage.addLayoutManager(manager)
    var fraction: CGFloat = 0
    let glyph = manager.glyphIndex(for: point, in: container, fractionOfDistanceThroughGlyph: &fraction)
    let lineRect = manager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
    guard lineRect.insetBy(dx: 0, dy: -4).contains(point) else { return nil }
    let index = manager.characterIndexForGlyph(at: glyph)
    guard index < text.length else { return nil }
    return text.attribute(.spanIndex, at: index, effectiveRange: nil) as? Int
  }
}

/// The bubble's tail (bubble-shape.tsx): 22 × 27 points, its top-right
/// corner on the bubble's right edge, 20 above the bottom. Drawn in the
/// bubble's color, under the content; mirrored for incoming bubbles.
final class TailView: UIView {
  override class var layerClass: AnyClass { CAShapeLayer.self }
  private var shape: CAShapeLayer { layer as! CAShapeLayer }

  static let path: CGPath = {
    let path = UIBezierPath()
    path.move(to: CGPoint(x: 22, y: 0))
    path.addCurve(to: CGPoint(x: 11.48, y: 19.93), controlPoint1: CGPoint(x: 22, y: 12.35), controlPoint2: CGPoint(x: 11.48, y: 15.7))
    path.addCurve(to: CGPoint(x: 13.58, y: 25.21), controlPoint1: CGPoint(x: 11.48, y: 22.54), controlPoint2: CGPoint(x: 12.49, y: 23.61))
    // The round tip: an arc of radius 1.03 to (12.33, 26.73).
    path.addArc(withCenter: CGPoint(x: 12.72, y: 25.78), radius: 1.03, startAngle: -0.585, endAngle: 1.96, clockwise: true)
    path.addCurve(to: CGPoint(x: 0.11, y: 20), controlPoint1: CGPoint(x: 4.58, y: 23.49), controlPoint2: CGPoint(x: 2.61, y: 20))
    path.addLine(to: CGPoint(x: 0, y: 20))
    path.addLine(to: CGPoint(x: 0, y: 0))
    path.close()
    return path.cgPath
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    shape.path = Self.path
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(color: UIColor, side: Side) {
    shape.fillColor = color.cgColor
    transform = side == .right ? .identity : CGAffineTransform(scaleX: -1, y: 1)
  }
}

final class BubbleView: UIView {
  let text = TextView()
  private let tail = TailView(frame: CGRect(x: 0, y: 0, width: 22, height: 27))
  private var tailSide: Side?

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(tail)
    addSubview(text)
    layer.cornerCurve = .circular
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ box: TextBox, bubble: BubbleStyle?) {
    text.text = box.string
    text.frame = box.frame
    backgroundColor = bubble?.fill
    layer.cornerRadius = bubble?.radius ?? 0
    layer.borderWidth = bubble?.border == nil ? 0 : 1
    layer.borderColor = bubble?.border?.cgColor
    tailSide = bubble?.tail
    if let side = bubble?.tail, let fill = bubble?.fill {
      tail.isHidden = false
      tail.set(color: fill, side: side)
    } else {
      tail.isHidden = true
    }
    placeTail()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    placeTail()
  }

  private func placeTail() {
    guard tailSide != nil else { return }
    // bounds/center, not frame: the tail may be mirrored.
    tail.bounds = CGRect(x: 0, y: 0, width: 22, height: 27)
    tail.center = tailCenter(in: bounds.size)
  }

  private func tailCenter(in size: CGSize) -> CGPoint {
    CGPoint(x: tailSide == .right ? size.width - 11 : 11, y: size.height - 20 + 13.5)
  }

  // MARK: Growing out of the typing bubble

  private var growDots: CALayer?

  /// Plays the bubble from `start` (the typing bubble, in the superview's
  /// coordinates) to where it is, as bubble-morph.tsx does: its size and
  /// place over 320 ms (the list's ease), corners and tail riding along;
  /// the typing dots, in their place, fade by a third of the way; the text
  /// fades in over 220 ms once the bubble is its size. Only Core Animation
  /// moves, so a busy main thread can't stall it.
  func grow(from start: CGRect, dots color: UIColor, done: @escaping () -> Void) {
    endGrow()
    let final = frame
    let duration = 0.32
    let curve = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1)
    func basic(_ key: String, from: Any, to: Any) -> CABasicAnimation {
      let animation = CABasicAnimation(keyPath: key)
      animation.fromValue = from
      animation.toValue = to
      animation.duration = duration
      animation.timingFunction = curve
      return animation
    }
    // The typing bubble's dots (8 points, 12 apart, centered), kept at the
    // same height above the bubble's bottom as it grows.
    let dotsBox = CALayer()
    let fromBottom = start.height / 2 + 4
    dotsBox.frame = CGRect(x: (start.width - 32) / 2, y: final.height - fromBottom, width: 32, height: 8)
    for index in 0..<3 {
      let dot = CALayer()
      dot.frame = CGRect(x: CGFloat(index) * 12, y: 0, width: 8, height: 8)
      dot.cornerRadius = 4
      dot.backgroundColor = color.cgColor
      dotsBox.addSublayer(dot)
    }
    dotsBox.opacity = 0
    layer.addSublayer(dotsBox)
    growDots = dotsBox

    CATransaction.begin()
    CATransaction.setCompletionBlock { [weak self, weak dotsBox] in
      dotsBox?.removeFromSuperlayer()
      if let self, self.growDots === dotsBox { self.growDots = nil }
      done()
    }
    layer.add(basic("bounds.size", from: NSValue(cgSize: start.size), to: NSValue(cgSize: final.size)), forKey: "growSize")
    layer.add(basic("position", from: NSValue(cgPoint: CGPoint(x: start.midX, y: start.midY)),
                    to: NSValue(cgPoint: CGPoint(x: final.midX, y: final.midY))), forKey: "growPosition")
    layer.add(basic("cornerRadius", from: start.height / 2, to: layer.cornerRadius), forKey: "growCorners")
    if tailSide != nil {
      tail.layer.add(basic("position", from: NSValue(cgPoint: tailCenter(in: start.size)),
                           to: NSValue(cgPoint: tailCenter(in: final.size))), forKey: "growTail")
    }
    // Everything inside is placed from the top left: lay the dots and the
    // text from the bottom left, where the bubble grows from.
    dotsBox.add(basic("position.y", from: start.height - fromBottom + 4, to: final.height - fromBottom + 4), forKey: "growDots")
    let dotsOut = CAKeyframeAnimation(keyPath: "opacity")
    dotsOut.values = [1, 0, 0]
    dotsOut.keyTimes = [0, NSNumber(value: 1.0 / 3), 1]
    dotsOut.duration = duration
    dotsBox.add(dotsOut, forKey: "growDotsOut")
    let textIn = CAKeyframeAnimation(keyPath: "opacity")
    textIn.values = [0, 0, 1]
    textIn.keyTimes = [0, NSNumber(value: duration / (duration + 0.22)), 1]
    textIn.duration = duration + 0.22
    text.layer.add(textIn, forKey: "growText")
    CATransaction.commit()
  }

  /// Stops a grow at its end (the cell is recycled).
  func endGrow() {
    for key in ["growSize", "growPosition", "growCorners"] { layer.removeAnimation(forKey: key) }
    tail.layer.removeAnimation(forKey: "growTail")
    text.layer.removeAnimation(forKey: "growText")
    growDots?.removeFromSuperlayer()
    growDots = nil
  }
}

/// A file: an icon, its name, and its size.
final class FileView: UIView {
  private let icon = UIView()
  private let glyph = UIImageView()
  private let name = TextView()
  private let size = TextView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    layer.cornerRadius = 16
    layer.cornerCurve = .continuous
    icon.layer.cornerRadius = 8
    icon.layer.cornerCurve = .continuous
    glyph.contentMode = .center
    glyph.image = UIImage(systemName: "doc.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 20))
    addSubview(icon)
    icon.addSubview(glyph)
    addSubview(name)
    addSubview(size)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(name: TextBox, size: TextBox, icon frame: CGRect, theme: Theme) {
    backgroundColor = theme.bubbleIncoming
    icon.backgroundColor = theme.accent
    glyph.tintColor = theme.onAccent
    icon.frame = frame
    glyph.frame = icon.bounds
    self.name.text = name.string
    self.name.frame = name.frame
    self.size.text = size.string
    self.size.frame = size.frame
  }
}

/// A link's preview: an image, the site, the title, and a description.
final class LinkCardView: UIView {
  let image = UIImageView()
  private let site = TextView()
  private let title = TextView()
  private let detail = TextView()
  private let icon = UIImageView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    layer.cornerRadius = 16
    layer.cornerCurve = .continuous
    layer.borderWidth = 1 / UIScreen.main.scale
    image.contentMode = .scaleAspectFill
    image.clipsToBounds = true
    image.layer.cornerRadius = 16
    image.layer.cornerCurve = .continuous
    image.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    icon.contentMode = .center
    icon.layer.cornerRadius = 8
    icon.layer.cornerCurve = .continuous
    icon.image = UIImage(systemName: "link", withConfiguration: UIImage.SymbolConfiguration(pointSize: 16))
    [image, site, title, detail, icon].forEach(addSubview)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ layout: LinkCardLayout, theme: Theme) {
    backgroundColor = theme.backgroundElevated
    layer.borderColor = theme.separator.cgColor
    image.backgroundColor = theme.fill
    if let frame = layout.image {
      image.isHidden = false
      image.frame = frame
      Images.load(image, layout.card.imageUrl, size: frame.size)
    } else {
      image.isHidden = true
      Images.cancel(image)
    }
    icon.isHidden = layout.icon == nil
    icon.frame = layout.icon ?? .zero
    icon.backgroundColor = theme.fill
    icon.tintColor = theme.muted
    for (view, box) in [(site, layout.site), (title, layout.title), (detail, layout.description)] {
      view.isHidden = box == nil
      view.text = box?.string
      view.frame = box?.frame ?? .zero
    }
  }
}

/// The message a reply answers (bubbles): a bordered card.
final class QuoteView: UIView {
  private let author = TextView()
  private let text = TextView()
  let thumbnail = UIImageView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    layer.cornerRadius = 16
    layer.borderWidth = 1
    thumbnail.contentMode = .scaleAspectFill
    thumbnail.clipsToBounds = true
    thumbnail.layer.cornerRadius = 6
    [author, text, thumbnail].forEach(addSubview)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(author: TextBox, text: TextBox, thumbnail frame: CGRect?, url: URL?, theme: Theme) {
    layer.borderColor = theme.separator.cgColor
    self.author.text = author.string
    self.author.frame = author.frame
    self.text.text = text.string
    self.text.frame = text.frame
    thumbnail.backgroundColor = theme.fill
    if let frame {
      thumbnail.isHidden = false
      thumbnail.frame = frame
      Images.load(thumbnail, url, size: frame.size)
    } else {
      thumbnail.isHidden = true
    }
  }
}

/// A stroked path: the reply curve (bubbles) and the quote elbow (stacked).
final class LineView: UIView {
  override class var layerClass: AnyClass { CAShapeLayer.self }
  private var shape: CAShapeLayer { layer as! CAShapeLayer }

  enum Kind { case replyCurve(Side), elbow }
  var kind: Kind = .elbow

  override init(frame: CGRect) {
    super.init(frame: frame)
    shape.fillColor = nil
    shape.lineWidth = 2
    shape.lineCap = .round
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ kind: Kind, color: UIColor) {
    self.kind = kind
    shape.strokeColor = color.cgColor
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let path = UIBezierPath()
    let b = bounds
    switch kind {
    case let .replyCurve(side):
      // Down from the quote, curving into the reply's side.
      let x = side == .left ? b.minX + 1 : b.maxX - 1
      let end = side == .left ? b.maxX : b.minX
      path.move(to: CGPoint(x: x, y: b.minY))
      path.addLine(to: CGPoint(x: x, y: max(b.minY, b.maxY - 10)))
      path.addQuadCurve(to: CGPoint(x: end, y: b.maxY - 1), controlPoint: CGPoint(x: x, y: b.maxY - 1))
    case .elbow:
      // Up from the avatar's center, then right to the quoted face.
      path.move(to: CGPoint(x: b.minX + 1, y: b.maxY))
      path.addLine(to: CGPoint(x: b.minX + 1, y: b.minY + 10))
      path.addQuadCurve(to: CGPoint(x: b.minX + 11, y: b.minY + 1), controlPoint: CGPoint(x: b.minX + 1, y: b.minY + 1))
      path.addLine(to: CGPoint(x: b.maxX, y: b.minY + 1))
    }
    shape.path = path.cgPath
  }
}

/// A reply's line above a stacked row: an elbow, the quoted face, and text.
final class QuoteLineView: UIView {
  private let elbow = LineView()
  private let face = AvatarView()
  private let text = TextView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    [elbow, face, text].forEach(addSubview)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(face frame: CGRect, person: Person, text box: TextBox, elbow elbowFrame: CGRect, theme: Theme) {
    elbow.frame = elbowFrame
    elbow.set(.elbow, color: theme.separator)
    face.frame = frame
    face.set(person, size: frame.width, theme: theme)
    text.text = box.string
    text.frame = box.frame
  }
}
