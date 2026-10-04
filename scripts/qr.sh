#!/usr/bin/env bash
# Writes a QR code PNG for a URL with Core Image (no extra tools), so Shawn
# can open a link on his phone by pointing the camera at the screen.
#
#   scripts/qr.sh <url> <file.png>
set -euo pipefail
swift - "${1:?url}" "${2:?png path}" <<'SWIFT' >/dev/null
import CoreImage
import ImageIO
import UniformTypeIdentifiers
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(CommandLine.arguments[1].data(using: .utf8), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let image = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
let cg = CIContext().createCGImage(image, from: image.extent)!
let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(out, cg, nil)
precondition(CGImageDestinationFinalize(out))
SWIFT
echo "$2"
