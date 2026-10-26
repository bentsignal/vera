import UIKit

/// For benchmarks only (contract: `benchFling`): scrolls the list toward
/// older messages at a constant speed, moved on the display link each frame
/// from wherever it is, with no deceleration, the way the React Native
/// list's benchmark drives Reanimated's `scrollTo`. So the two compare
/// without a test driver's injected touches. At the oldest row it waits
/// while older rows load.
final class BenchFling {
  private let speed: CGFloat
  private let duration: CFTimeInterval
  private weak var list: UIScrollView?
  /// The furthest the list can go now (older pages make it further).
  private let oldest: () -> CGFloat
  private let done: ([String: Any]) -> Void
  private var link: CADisplayLink?
  private var start: CFTimeInterval?
  private var last: CFTimeInterval = 0
  private var travelled: CGFloat = 0
  private var edgeMs: Double = 0

  init(speed: CGFloat, ms: Double, list: UIScrollView, oldest: @escaping () -> CGFloat, done: @escaping ([String: Any]) -> Void) {
    self.speed = speed
    duration = max(0, ms) / 1000
    self.list = list
    self.oldest = oldest
    self.done = done
  }

  func run() {
    let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  /// Stops early (another run, or the list going away), reporting so far.
  func stop() {
    guard let link else { return }
    link.invalidate()
    self.link = nil
    done(["travelled": Double(travelled), "edgeMs": edgeMs])
  }

  @objc private func tick(_ link: CADisplayLink) {
    guard let list, list.window != nil else { return stop() }
    let now = link.timestamp
    guard let start else {
      self.start = now
      last = now
      return
    }
    let frame = now - last
    last = now
    let y = list.contentOffset.y
    let target = min(y + speed * CGFloat(frame), oldest())
    if target > y + 0.01 {
      // Through setContentOffset, so the list's own scrolling paths run:
      // older pages are asked for and go in as in a real fling.
      list.setContentOffset(CGPoint(x: list.contentOffset.x, y: target), animated: false)
      travelled += target - y
    } else {
      edgeMs += frame * 1000
    }
    if now - start >= duration { stop() }
  }
}
