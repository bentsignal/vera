// Renders the flat icon assets from the bubble in vera-green.icon and the
// colors in palette.json:
//   vera-android-foreground.png        Android adaptive foreground and monochrome
//   vera-green-android-background.png  Android adaptive background
//   ../images/icon.png                 square, opaque fallback icon
//   ../images/splash-icon.png          green bubble for the splash screen
//   family-preview.png                 every theme, light over dark (from previews/)
// Usage: swift render-previews.swift "$PWD" (after build-icons.py).
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let themes = ["indigo", "blue", "teal", "green", "orange", "pink", "purple", "graphite"]
let space = CGColorSpace(name: CGColorSpace.sRGB)!

func rgb(_ hex: String) -> [CGFloat] {
  let n = UInt32(hex.dropFirst(), radix: 16)!
  return [CGFloat((n >> 16) & 255) / 255, CGFloat((n >> 8) & 255) / 255, CGFloat(n & 255) / 255]
}
func color(_ c: [CGFloat], _ a: CGFloat = 1) -> CGColor { CGColor(colorSpace: space, components: c + [a])! }

let palette = try! JSONSerialization.jsonObject(
  with: Data(contentsOf: root.appendingPathComponent("palette.json"))) as! [String: [String: String]]
let green = [rgb(palette["green"]!["light_top"]!), rgb(palette["green"]!["light_bottom"]!)]

// The bubble path uses only absolute M, C, and Z commands.
let svg = try! String(contentsOf: root.appendingPathComponent("vera-green.icon/Assets/bubble.svg"), encoding: .utf8)
let tokens = svg.components(separatedBy: " d=\"")[1].components(separatedBy: "\"")[0].split(separator: " ").map(String.init)
let bubble = CGMutablePath()
var i = 0
func number() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i])!) }
func point() -> CGPoint { CGPoint(x: number(), y: number()) }
while i < tokens.count {
  let command = tokens[i]; i += 1
  switch command {
  case "M": bubble.move(to: point())
  case "C": let a = point(), b = point(), c = point(); bubble.addCurve(to: c, control1: a, control2: b)
  case "Z": bubble.closeSubpath()
  default: fatalError(command)
  }
}
let box = bubble.boundingBox

func context(_ size: Int, opaque: Bool = false) -> CGContext {
  CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
            bitmapInfo: (opaque ? CGImageAlphaInfo.noneSkipLast : .premultipliedLast).rawValue)!
}
func write(_ ctx: CGContext, _ name: String) {
  let d = CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(d, ctx.makeImage()!, nil); precondition(CGImageDestinationFinalize(d))
}
func verticalGradient(_ ctx: CGContext, _ colors: [[CGFloat]], top: CGFloat, bottom: CGFloat) {
  let g = CGGradient(colorsSpace: space, colors: colors.map { color($0) } as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: top), end: CGPoint(x: 0, y: bottom),
                         options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}
// Flips to SVG coordinates and centers the bubble at `width` pixels wide.
func placeBubble(_ ctx: CGContext, size: Int, width: CGFloat) {
  let s = width / box.width, c = CGFloat(size) / 2
  ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1)
  ctx.translateBy(x: c, y: c); ctx.scaleBy(x: s, y: s); ctx.translateBy(x: -box.midX, y: -box.midY)
}

// Android: white bubble inside the 66% safe zone, on the green gradient.
let foreground = context(1024)
placeBubble(foreground, size: 1024, width: 520)
foreground.addPath(bubble); foreground.setFillColor(color([1, 1, 1])); foreground.fillPath()
write(foreground, "vera-android-foreground.png")
let background = context(1024, opaque: true)
verticalGradient(background, green, top: 1024, bottom: 0)
write(background, "vera-green-android-background.png")

// Square opaque icon: the light appearance without glass.
let icon = context(1024, opaque: true)
verticalGradient(icon, green, top: 1024, bottom: 0)
placeBubble(icon, size: 1024, width: box.width)
icon.setShadow(offset: CGSize(width: 0, height: 10), blur: 24, color: color([0, 0.3, 0.05], 0.25))
icon.addPath(bubble); icon.setFillColor(color([1, 1, 1])); icon.fillPath()
write(icon, "../images/icon.png")

// Splash: the bubble in green, filling the canvas.
let splash = context(512)
placeBubble(splash, size: 512, width: 496)
splash.addPath(bubble); splash.clip()
verticalGradient(splash, green, top: box.minY, bottom: box.maxY)
write(splash, "../images/splash-icon.png")

// Family preview: each theme's ictool preview, light row over dark row.
let cell = 150
let family = CGContext(data: nil, width: cell * themes.count, height: cell * 2, bitsPerComponent: 8, bytesPerRow: 0,
                       space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
family.interpolationQuality = .high
for (column, theme) in themes.enumerated() {
  for (row, mode) in ["light", "dark"].enumerated() {
    let url = root.appendingPathComponent("previews/\(theme)-\(mode).png")
    let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL, nil)!, 0, nil)!
    family.draw(image, in: CGRect(x: column * cell, y: (1 - row) * cell, width: cell, height: cell))
  }
}
write(family, "family-preview.png")
