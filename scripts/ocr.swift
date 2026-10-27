// On-screen text recognition with Apple's Vision framework (local, free). Compiled on first use by src/lib/ocr.ts.
// Usage: ocr <image>... → one JSON line per image:
// {"file": "...", "items": [{"text": "...", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.02, "conf": 0.9}]}
// Boxes are normalized 0–1 with the origin at the top left.
import AppKit
import Foundation
import Vision

for path in CommandLine.arguments.dropFirst() {
  var items: [[String: Any]] = []
  if let image = NSImage(contentsOfFile: path),
    let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cg).perform([request])
    for observation in request.results ?? [] {
      guard let best = observation.topCandidates(1).first else { continue }
      let b = observation.boundingBox
      items.append([
        "text": best.string, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height, "conf": best.confidence,
      ])
    }
  }
  let data = try! JSONSerialization.data(withJSONObject: ["file": path, "items": items])
  print(String(data: data, encoding: .utf8)!)
}
