import UIKit

/// The contract's `Theme`: colors, type, and metrics from JavaScript, so the
/// look ships over the air. Missing values fall back to the light theme.
struct Theme {
  struct TextStyle: Equatable {
    var size: CGFloat
    var lineHeight: CGFloat
  }

  var background = UIColor.white
  var backgroundElevated = UIColor.white
  var foreground = UIColor.black
  var muted = UIColor(red: 60 / 255, green: 60 / 255, blue: 67 / 255, alpha: 0.6)
  var subtle = UIColor(red: 60 / 255, green: 60 / 255, blue: 67 / 255, alpha: 0.3)
  var separator = UIColor(red: 60 / 255, green: 60 / 255, blue: 67 / 255, alpha: 0.29)
  var fill = UIColor(red: 118 / 255, green: 118 / 255, blue: 128 / 255, alpha: 0.12)
  var accent = UIColor.systemBlue
  var onAccent = UIColor.white
  var bubbleIncoming = UIColor(red: 233 / 255, green: 233 / 255, blue: 235 / 255, alpha: 1)
  var bubbleOutgoing = UIColor.systemBlue
  var textIncoming = UIColor.black
  var textOutgoing = UIColor.white
  var destructive = UIColor.systemRed
  var highlight = UIColor(red: 124 / 255, green: 124 / 255, blue: 1, alpha: 0.18)
  var monogramTop = UIColor(red: 166 / 255, green: 171 / 255, blue: 184 / 255, alpha: 1)
  var monogramBottom = UIColor(red: 133 / 255, green: 137 / 255, blue: 148 / 255, alpha: 1)

  var body = TextStyle(size: 17, lineHeight: 22)
  var name = TextStyle(size: 12, lineHeight: 16)
  var caption = TextStyle(size: 12, lineHeight: 16)
  var footnote = TextStyle(size: 13, lineHeight: 18)
  var jumbo = TextStyle(size: 40, lineHeight: 44)

  var bubbleRadius: CGFloat = 20
  var bubbleMaxWidthFraction: CGFloat = 0.75
  var avatarSize: CGFloat = 36
  var horizontalPadding: CGFloat = 16
  var runGap: CGFloat = 14
  var rowGap: CGFloat = 4

  /// Bumped on every change, so measurements cached for an older theme are
  /// thrown away.
  var version = 0

  init() {}

  init(_ json: JSON) {
    let colors = json.object("colors") ?? [:]
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      colors.string(key).flatMap(UIColor.init(css:)) ?? fallback
    }
    background = color("background", background)
    backgroundElevated = color("backgroundElevated", background)
    foreground = color("foreground", foreground)
    muted = color("muted", muted)
    subtle = color("subtle", subtle)
    separator = color("separator", separator)
    fill = color("fill", fill)
    accent = color("accent", accent)
    onAccent = color("onAccent", onAccent)
    bubbleIncoming = color("bubbleIncoming", bubbleIncoming)
    bubbleOutgoing = color("bubbleOutgoing", bubbleOutgoing)
    textIncoming = color("textIncoming", textIncoming)
    textOutgoing = color("textOutgoing", textOutgoing)
    destructive = color("destructive", destructive)
    highlight = color("highlight", highlight)
    monogramTop = color("monogramTop", monogramTop)
    monogramBottom = color("monogramBottom", monogramBottom)

    let type = json.object("type") ?? [:]
    func style(_ key: String, _ fallback: TextStyle) -> TextStyle {
      guard let value = type.object(key) else { return fallback }
      return TextStyle(size: value.cg("size", fallback.size), lineHeight: value.cg("lineHeight", fallback.lineHeight))
    }
    body = style("body", body)
    name = style("name", name)
    caption = style("caption", caption)
    footnote = style("footnote", footnote)
    jumbo = style("jumbo", jumbo)

    let metrics = json.object("metrics") ?? [:]
    bubbleRadius = metrics.cg("bubbleRadius", bubbleRadius)
    bubbleMaxWidthFraction = metrics.cg("bubbleMaxWidthFraction", bubbleMaxWidthFraction)
    avatarSize = metrics.cg("avatarSize", avatarSize)
    horizontalPadding = metrics.cg("horizontalPadding", horizontalPadding)
    runGap = metrics.cg("runGap", runGap)
    rowGap = metrics.cg("rowGap", rowGap)
  }
}

extension UIColor {
  /// `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `rgba(…)`, and `transparent`.
  convenience init?(css raw: String) {
    let value = raw.trimmingCharacters(in: .whitespaces).lowercased()
    if value == "transparent" {
      self.init(white: 0, alpha: 0)
      return
    }
    if value.hasPrefix("#") {
      var hex = String(value.dropFirst())
      if hex.count == 3 || hex.count == 4 { hex = hex.map { "\($0)\($0)" }.joined() }
      guard hex.count == 6 || hex.count == 8, let number = UInt64(hex, radix: 16) else { return nil }
      let hasAlpha = hex.count == 8
      let r = CGFloat((number >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
      let g = CGFloat((number >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
      let b = CGFloat((number >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
      let a = hasAlpha ? CGFloat(number & 0xFF) / 255 : 1
      self.init(red: r, green: g, blue: b, alpha: a)
      return
    }
    if value.hasPrefix("rgb"), let open = value.firstIndex(of: "("), let close = value.lastIndex(of: ")") {
      let parts = value[value.index(after: open)..<close]
        .split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" })
        .compactMap { part -> CGFloat? in
          if part.hasSuffix("%") { return Double(part.dropLast()).map { CGFloat($0) / 100 } }
          return Double(part).map { CGFloat($0) }
        }
      guard parts.count >= 3 else { return nil }
      self.init(red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255, alpha: parts.count > 3 ? parts[3] : 1)
      return
    }
    return nil
  }
}

/// Fonts and attributed text from the theme's sizes.
enum Fonts {
  static func system(_ size: CGFloat, _ weight: UIFont.Weight = .regular, italic: Bool = false) -> UIFont {
    let font = UIFont.systemFont(ofSize: size, weight: weight)
    guard italic, let descriptor = font.fontDescriptor.withSymbolicTraits(.traitItalic) else { return font }
    return UIFont(descriptor: descriptor, size: size)
  }

  /// A paragraph with a fixed line height, the glyphs centered in it.
  static func attributes(
    _ font: UIFont,
    _ color: UIColor,
    lineHeight: CGFloat? = nil,
    alignment: NSTextAlignment = .natural,
    lineBreak: NSLineBreakMode = .byWordWrapping
  ) -> [NSAttributedString.Key: Any] {
    let paragraph = NSMutableParagraphStyle()
    let height = lineHeight ?? ceil(font.lineHeight)
    paragraph.minimumLineHeight = height
    paragraph.maximumLineHeight = height
    paragraph.alignment = alignment
    paragraph.lineBreakMode = lineBreak
    // No baseline offset: it changes how tall TextKit measures the lines.
    // TextView centers the glyphs in their lines when it draws instead.
    return [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: paragraph,
    ]
  }
}
