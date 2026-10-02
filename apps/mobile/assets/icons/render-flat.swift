// Renders the flat icon assets from vera.icon (its SVG leaves and the fills
// in icon.json), and cuts the splash image out of build-icons.py's glass
// renders:
//   vera-android-foreground.png   Android adaptive foreground (light leaves)
//   vera-android-monochrome.png   Android themed icon (white leaves)
//   vera-android-background.png   Android adaptive background
//   ../images/icon.png            square, opaque fallback icon
//   ../images/splash-icon.png     the dark icon's green glass leaves, for both splashes
// In the flat assets a thin transparent gap separates overlapping leaves,
// standing in for the glass edges.
// Usage: swift render-flat.swift "$PWD" SPLASH_DIR (build-icons.py runs it).
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let splashSources = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let bundle = root.appendingPathComponent("vera.icon")
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let document = try! JSONSerialization.jsonObject(
  with: Data(contentsOf: bundle.appendingPathComponent("icon.json"))) as! [String: Any]

enum Appearance { case light, dark }

/// A fill as gradient stops (one stop for a solid color).
func stops(_ value: [String: Any]) -> [CGColor] {
  let colors = (value["linear-gradient"] as? [String]) ?? [value["solid"] as! String]
  return colors.map { c in
    let parts = c.replacingOccurrences(of: "extended-srgb:", with: "").split(separator: ",").map { CGFloat(Double($0)!) }
    return CGColor(colorSpace: space, components: parts)!
  }
}

/// The fill for an appearance: its specialization, else the unqualified one.
func fill(_ specializations: [[String: Any]], _ appearance: Appearance) -> [CGColor] {
  let name = appearance == .dark ? "dark" : nil
  let match = specializations.first { ($0["appearance"] as? String) == name }
    ?? specializations.first { $0["appearance"] == nil }!
  return stops(match["value"] as! [String: Any])
}

/// The paths in an SVG layer; they use only absolute M, L, and Z.
func paths(_ image: String) -> [CGPath] {
  let svg = try! String(contentsOf: bundle.appendingPathComponent("Assets/\(image)"), encoding: .utf8)
  return svg.components(separatedBy: " d=\"").dropFirst().map { chunk in
    let tokens = chunk.components(separatedBy: "\"")[0].split(separator: " ").map(String.init)
    let path = CGMutablePath()
    var i = 0
    func point() -> CGPoint { defer { i += 2 }; return CGPoint(x: Double(tokens[i])!, y: Double(tokens[i + 1])!) }
    while i < tokens.count {
      let command = tokens[i]; i += 1
      switch command {
      case "M": path.move(to: point())
      case "L": path.addLine(to: point())
      case "Z": path.closeSubpath()
      default: fatalError(command)
      }
    }
    return path
  }
}

struct Layer { let paths: [CGPath]; let fills: [[String: Any]] }

// Back to front: Icon Composer lists groups and their layers front to back.
let layers: [Layer] = (document["groups"] as! [[String: Any]]).reversed().flatMap { group in
  (group["layers"] as! [[String: Any]]).reversed().map { layer in
    Layer(paths: paths(layer["image-name"] as! String),
          fills: layer["fill-specializations"] as! [[String: Any]])
  }
}
let box = layers.flatMap(\.paths).reduce(CGRect.null) { $0.union($1.boundingBoxOfPath) }

func context(_ size: Int, opaque: Bool = false) -> CGContext {
  CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
            bitmapInfo: (opaque ? CGImageAlphaInfo.noneSkipLast : .premultipliedLast).rawValue)!
}
func write(_ ctx: CGContext, _ name: String) {
  let d = CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(d, ctx.makeImage()!, nil); precondition(CGImageDestinationFinalize(d))
}
/// Fills the current clip with a top-to-bottom gradient over `rect` (SVG coordinates).
func gradient(_ ctx: CGContext, _ colors: [CGColor], _ rect: CGRect) {
  let g = CGGradient(colorsSpace: space, colors: (colors.count == 1 ? colors + colors : colors) as CFArray, locations: nil)!
  ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: rect.minY), end: CGPoint(x: 0, y: rect.maxY),
                         options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}

/// The leaves on a transparent canvas, `width` pixels across, centered.
/// `white` draws every leaf white (the monochrome icon).
func leaves(size: Int, width: CGFloat, appearance: Appearance, white: Bool = false) -> CGImage {
  let ctx = context(size)
  let s = width / max(box.width, box.height), c = CGFloat(size) / 2
  ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1)
  ctx.translateBy(x: c, y: c); ctx.scaleBy(x: s, y: s); ctx.translateBy(x: -box.midX, y: -box.midY)
  for layer in layers {
    let bounds = layer.paths.reduce(CGRect.null) { $0.union($1.boundingBoxOfPath) }
    for path in layer.paths {
      // Cut a gap around the leaf into the leaves behind it.
      ctx.saveGState()
      ctx.setBlendMode(.clear)
      ctx.addPath(path); ctx.setLineWidth(14); ctx.setLineJoin(.round); ctx.strokePath()
      ctx.restoreGState()
      ctx.saveGState()
      ctx.addPath(path); ctx.clip()
      gradient(ctx, white ? [CGColor(colorSpace: space, components: [1, 1, 1, 1])!] : fill(layer.fills, appearance), bounds)
      ctx.restoreGState()
    }
  }
  return ctx.makeImage()!
}

let background = stops((document["fill"] as! [String: Any]))
func drawBackground(_ ctx: CGContext, _ size: Int) {
  let g = CGGradient(colorsSpace: space, colors: background as CFArray, locations: nil)!
  ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: size), end: .zero, options: [])
}
let full = CGRect(x: 0, y: 0, width: 1024, height: 1024)
let iconWidth = max(box.width, box.height) // Their size on the Icon Composer canvas.

// Android: leaves inside the 66% safe zone of the adaptive icon.
let foreground = context(1024)
foreground.draw(leaves(size: 1024, width: 600, appearance: .light), in: full)
write(foreground, "vera-android-foreground.png")
let monochrome = context(1024)
monochrome.draw(leaves(size: 1024, width: 600, appearance: .light, white: true), in: full)
write(monochrome, "vera-android-monochrome.png")
let androidBackground = context(1024, opaque: true)
drawBackground(androidBackground, 1024)
write(androidBackground, "vera-android-background.png")

// Square opaque icon: the light appearance without glass.
let icon = context(1024, opaque: true)
drawBackground(icon, 1024)
icon.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: CGColor(colorSpace: space, components: [0, 0.2, 0.05, 0.25])!)
icon.draw(leaves(size: 1024, width: iconWidth, appearance: .light), in: full)
write(icon, "../images/icon.png")

// Splash: the glass leaves alone, rendered on black and on white,
// which ictool draws as near-black kb and near-white kw (sampled from a
// corner). A pixel of color c and coverage a shows as B = c*a + kb*(1 - a)
// and W = c*a + kw*(1 - a), so a = 1 - (W - B) / (kw - kb) and the
// premultiplied color is B - kb*(1 - a). The crop keeps the leaves and their
// shadows and drops the icon's rim; a radial fade past the leaf tips clears
// the faint glass haze that would otherwise end in a visible square.
/// RGBA bytes, rows `size * 4` bytes apart.
func pixels(_ name: String, _ size: Int) -> [UInt8] {
  let url = splashSources.appendingPathComponent(name)
  let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL, nil)!, 0, nil)!
  let ctx = context(size)
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
  let data = ctx.data!.assumingMemoryBound(to: UInt8.self)
  return (0..<size).flatMap { y in UnsafeBufferPointer(start: data + y * ctx.bytesPerRow, count: size * 4) }
}
let side = Int(max(box.width, box.height)) + 96
let origin = (1024 - side) / 2
// The farthest leaf tip from the center, and where the fade ends.
var tip = 0.0
for path in layers.flatMap(\.paths) {
  let b = path.boundingBoxOfPath
  for (x, y) in [(b.minX, b.minY), (b.maxX, b.minY), (b.minX, b.maxY), (b.maxX, b.maxY)] {
    tip = max(tip, Double(hypot(x - 512, y - 512)))
  }
}
let inner = tip * 0.92
let outer = Double(side) / 2 - 2
do {
  let black = pixels("splash-black.png", 1024), white = pixels("splash-white.png", 1024)
  let corner = (origin * 1024 + origin) * 4
  let kb = (0..<3).map { Double(black[corner + $0]) }, kw = (0..<3).map { Double(white[corner + $0]) }
  let splash = context(side)
  let out = splash.data!.assumingMemoryBound(to: UInt8.self)
  for y in 0..<side {
    for x in 0..<side {
      let i = ((origin + y) * 1024 + origin + x) * 4, o = y * splash.bytesPerRow + x * 4
      let cover = (0..<3).map { 1 - (Double(white[i + $0]) - Double(black[i + $0])) / (kw[$0] - kb[$0]) }
      let radius = hypot(Double(x - side / 2), Double(y - side / 2))
      let fade: Double = max(0, min(1, (outer - radius) / (outer - inner)))
      let smooth: Double = fade * fade * (3 - 2 * fade)
      let raw: Double = max(0, min(1, cover.reduce(0, +) / 3))
      var alpha: Double = raw * smooth
      if alpha < 0.01 { alpha = 0 }
      for c in 0..<3 {
        // The color as covered before the fade, scaled down with it.
        let color = raw > 0 ? (Double(black[i + c]) - kb[c] * (1 - raw)) / raw : 0
        out[o + c] = UInt8(max(0, min(alpha * 255, (color * alpha).rounded())))
      }
      out[o + 3] = UInt8((alpha * 255).rounded())
    }
  }
  write(splash, "../images/splash-icon.png")
}
