// Lays out the concept renders as labeled contact sheets:
//   bubbles.png  b01-b10, light over dark
//   aloe.png     a01-a10, light over dark
// Usage: swift contact-sheet.swift "$PWD" (after build-concepts.py).
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let concepts = try! JSONSerialization.jsonObject(
  with: Data(contentsOf: root.appendingPathComponent("concepts.json"))) as! [[String: String]]
let space = CGColorSpace(name: CGColorSpace.sRGB)!

let cell = 220, icon = 180, columns = 5, label = 34, pad = 20

func sheet(prefix: String, name: String) {
  let items = concepts.filter { $0["id"]!.hasPrefix(prefix) }
  let rows = (items.count + columns - 1) / columns
  let rowHeight = icon * 2 + 12 + label + pad
  let width = cell * columns + pad, height = rowHeight * rows + pad
  let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .high
  ctx.setFillColor(CGColor(colorSpace: space, components: [0.96, 0.96, 0.97, 1])!)
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
  for (n, item) in items.enumerated() {
    let id = item["id"]!
    let x = pad + (n % columns) * cell + (cell - pad - icon) / 2
    let top = height - pad - (n / columns) * rowHeight
    for (k, mode) in ["light", "dark"].enumerated() {
      let url = root.appendingPathComponent("renders/\(id)-\(mode).png")
      let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL, nil)!, 0, nil)!
      ctx.draw(image, in: CGRect(x: x, y: top - icon * (k + 1) - 12 * k, width: icon, height: icon))
    }
    let text = NSAttributedString(string: "\(id.uppercased())  \(item["name"]!)", attributes: [
      .font: NSFont.systemFont(ofSize: 17, weight: .semibold),
      .foregroundColor: NSColor(white: 0.15, alpha: 1),
    ])
    text.draw(at: CGPoint(x: x + 2, y: top - icon * 2 - 12 - label + 6))
  }
  let d = CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
  precondition(CGImageDestinationFinalize(d))
}

sheet(prefix: "b", name: "bubbles.png")
sheet(prefix: "a", name: "aloe.png")
