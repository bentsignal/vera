import UIKit
import UIKit.UIGestureRecognizerSubclass

/// Watches a finger down on the list without ever recognizing, so it
/// blocks nothing: it reports where a press starts, and when it ends,
/// moves away, or is cancelled.
final class PressTracker: UIGestureRecognizer {
  var onBegan: ((CGPoint) -> Void)?
  var onEnded: (() -> Void)?
  /// The finger came up (not moved away or cancelled), for Perf only.
  var onLifted: (() -> Void)?
  private var start: CGPoint = .zero

  override init(target: Any?, action: Selector?) {
    super.init(target: target, action: action)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard touches.count == 1, let touch = touches.first, event.allTouches?.count == 1 else {
      finish()
      return
    }
    start = touch.location(in: view)
    onBegan?(start)
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let touch = touches.first else { return }
    let point = touch.location(in: view)
    if hypot(point.x - start.x, point.y - start.y) > 10 { finish() }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    onLifted?()
    finish()
  }
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { finish() }

  private func finish() {
    onEnded?()
    if state == .possible { state = .failed }
  }
}

/// The part being pressed shrinks to 0.96 over the long press (as in the
/// React Native list), then springs back when it's held or let go.
final class PressShrink {
  private weak var pressed: UIView?
  static let scale: CGFloat = 0.96
  /// How long a hold takes; the shrink fills it.
  static let holdDuration = 0.32
  /// Matches useSqueeze: shrink from press-in over the hold's full length.
  func begin(_ find: @escaping () -> UIView?) {
    release()
    guard let view = find(), Self.shrinks(view) else { return }
    pressed = view
    UIView.animate(
      withDuration: Self.holdDuration, delay: 0,
      options: [.curveEaseInOut, .allowUserInteraction, .beginFromCurrentState]
    ) {
      view.transform = CGAffineTransform(scaleX: Self.scale, y: Self.scale)
    }
  }

  /// Springs back (damping 14, stiffness 320 in the RN list).
  func release() {
    guard let view = pressed else { return }
    pressed = nil
    let spring = UISpringTimingParameters(mass: 1, stiffness: 320, damping: 14, initialVelocity: .zero)
    let animator = UIViewPropertyAnimator(duration: 0, timingParameters: spring)
    animator.addAnimations {
      view.transform = .identity
    }
    animator.startAnimation()
  }

  /// Whatever is shrunk now goes back at once (it's being lifted).
  func reset() {
    pressed?.layer.removeAllAnimations()
    pressed?.transform = .identity
    pressed = nil
  }

  /// Parts that shrink: a reaction anywhere, but not cards in a deck or a
  /// carousel, which move.
  static func shrinks(_ view: UIView) -> Bool {
    if view is ChipView || view is TapbackView { return true }
    if view.superview is DeckView || view.superview is CarouselView || view is DeckCardView { return false }
    return view is BubbleView || view is MediaTileView || view is FileView || view is LinkCardView || view is QuoteView
  }
}
