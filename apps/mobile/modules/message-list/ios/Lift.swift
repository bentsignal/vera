import UIKit

// Holding a message opens JavaScript's menu: the conversation blurs, a
// reaction bar goes above the message, and the actions below it. Instead of
// a copy of the message drawn over the blur (which the React Native list
// used, and which overlapped and jumped as the blur faded), the real one
// lifts: its views move into a container above everything in the window,
// the menu's blur included, go where JavaScript says they fit, and come
// back to their place in the list when it closes. Only one is ever drawn.

/// What a message lifts: its held part (a deck's front card, a carousel's
/// photo), with its frame in the message's coordinates. Its tapbacks stay
/// in the row, hidden while it's up.
struct LiftPieces {
  let frame: CGRect
  let views: [UIView]
  /// Text without a bubble (a stacked row, jumbo emoji) lifts on a card
  /// in this color, as in the React Native menu.
  var card: UIColor?
}

final class Lifter {
  private struct Lifted {
    let request: LiftRequest
    let container: UIView
    let overlay: UIView
    /// Each view, where it came from, and its frame there.
    let pieces: [(view: UIView, home: UIView, frame: CGRect)]
    weak var cell: MessageCell?
  }

  private var lifted: Lifted?
  private weak var card: UIView?
  private var restorations = ComposerLandingTokens()
  private var landingAnimators: [Int: UIViewPropertyAnimator] = [:]
  var isLanding: Bool { restorations.active }
  /// A signal to re-evaluate CURRENT geometry, with no old owner/size payload.
  var onRestored: (() -> Void)?
  /// The row whose part is out of the list, if any.
  var rowId: String? { lifted?.request.rowId }

  /// The menu's open spring (glass-message-menu.tsx: damping 19, mass 0.9,
  /// stiffness 230).
  private static let spring = UISpringTimingParameters(mass: 0.9, stiffness: 230, damping: 19, initialVelocity: .zero)
  /// How long the row's tapbacks take to fade back in once it's landed
  /// (tapbacks.tsx RETURN_MS).
  private static let tapbacksReturn = 0.26
  /// The menu's close: 240 ms, ease-out cubic.
  private static let land = UICubicTimingParameters(controlPoint1: CGPoint(x: 0.215, y: 0.61), controlPoint2: CGPoint(x: 0.355, y: 1))

  /// Lifts the held part of `cell` to where `request` says.
  func lift(_ request: LiftRequest, cell: MessageCell, in window: UIWindow) {
    if let lifted, lifted.request.rowId == request.rowId {
      move(lifted, to: request)
      return
    }
    land(into: nil)
    // A new lift cancels the old handoff. Return its real views before
    // borrowing again, so the old container can never become their home.
    finishLandings()
    guard let pieces = cell.liftPieces(part: request.part, index: request.index), !pieces.views.isEmpty else { return }
    let body = cell.bodyView

    let overlay = UIView(frame: window.bounds)
    overlay.isUserInteractionEnabled = false
    overlay.backgroundColor = .clear
    window.addSubview(overlay)
    let frame = body.convert(pieces.frame, to: window)
    let container = UIView(frame: frame)
    container.layer.shadowColor = UIColor.black.cgColor
    container.layer.shadowOffset = CGSize(width: 0, height: 8)
    container.layer.shadowRadius = 18
    container.layer.shadowOpacity = 0
    overlay.addSubview(container)
    if let color = pieces.card {
      // The card reaches 10 past the text at the sides and 8 above and below.
      let card = UIView(frame: container.bounds.insetBy(dx: -10, dy: -8))
      card.backgroundColor = color
      card.layer.cornerRadius = 16
      card.layer.cornerCurve = .continuous
      card.alpha = 0
      container.addSubview(card)
      UIView.animate(withDuration: 0.2) { card.alpha = 1 }
      self.card = card
    }

    // The part may be mid-shrink (the press): it lifts from that size.
    let pressed = (pieces.views.first?.layer.presentation()?.value(forKeyPath: "transform.scale.x") as? CGFloat) ?? 1
    var moved: [(UIView, UIView, CGRect)] = []
    for view in pieces.views {
      guard let home = view.superview else { continue }
      view.layer.removeAllAnimations()
      view.transform = .identity
      moved.append((view, home, view.frame))
      let inContainer = home.convert(view.frame, to: container)
      container.addSubview(view)
      view.frame = inContainer
    }
    // The press scales about the part's center. The menu's target then
    // scales from its top corner, but the first frame stays where drawn.
    container.transform = CGAffineTransform(scaleX: pressed, y: pressed)
    let lifted = Lifted(request: request, container: container, overlay: overlay, pieces: moved, cell: cell)
    self.lifted = lifted
    cell.isLifted = true
    cell.outViews = Set(moved.map { ObjectIdentifier($0.0) })
    cell.setTapbacksHidden(true, fade: 0)
    keepOnTop(overlay, in: window)
    move(lifted, to: request)
  }

  private func move(_ lifted: Lifted, to request: LiftRequest) {
    let size = lifted.container.bounds.size
    let animator = UIViewPropertyAnimator(duration: 0.5, timingParameters: Self.spring)
    animator.addAnimations {
      lifted.container.transform = Self.transform(scale: request.scale, shift: request.shift, origin: request.origin, size: size)
    }
    animator.startAnimation()
    let shadow = CABasicAnimation(keyPath: "shadowOpacity")
    shadow.fromValue = lifted.container.layer.presentation()?.shadowOpacity ?? 0
    shadow.toValue = 0.22
    shadow.duration = 0.3
    lifted.container.layer.shadowOpacity = 0.22
    lifted.container.layer.add(shadow, forKey: "shadow")
  }

  /// Plays the part back to its place in the list, which may have moved:
  /// `cell` is where the row is now (nil if it's off screen, where it just
  /// fades). Then the views go home and the cell shows any update it held.
  func land(into cell: MessageCell?) {
    guard let lifted else { return }
    self.lifted = nil
    let restoration = restorations.begin()
    let container = lifted.container
    // An update that waited for the part goes in as it lands.
    if let cell, cell === lifted.cell { cell.beginLanding(duration: 0.24) }
    let destination: CGRect? = {
      guard let cell, let pieces = cell.liftPieces(part: lifted.request.part, index: lifted.request.index, frameOnly: true),
            let window = container.window else { return nil }
      return cell.bodyView.convert(pieces.frame, to: window)
    }()
    let animator = UIViewPropertyAnimator(duration: 0.24, timingParameters: Self.land)
    landingAnimators[restoration] = animator
    let card = self.card
    animator.addAnimations {
      card?.alpha = 0
      container.transform = .identity
      if let destination {
        container.center = CGPoint(x: destination.midX, y: destination.midY)
      } else {
        container.alpha = 0
      }
    }
    animator.addCompletion { _ in
      guard self.restorations.restored(restoration) else { return }
      self.landingAnimators[restoration] = nil
      for (view, home, frame) in lifted.pieces {
        home.addSubview(view)
        view.frame = frame
      }
      lifted.overlay.removeFromSuperview()
      lifted.cell?.reseat(lifted.pieces.map(\.view))
      lifted.cell?.isLifted = false
      lifted.cell?.setTapbacksHidden(false, fade: Self.tapbacksReturn)
      self.onRestored?()
    }
    let shadow = CABasicAnimation(keyPath: "shadowOpacity")
    shadow.fromValue = container.layer.presentation()?.shadowOpacity ?? 0.22
    shadow.toValue = 0
    shadow.duration = 0.24
    container.layer.shadowOpacity = 0
    container.layer.add(shadow, forKey: "shadow")
    animator.startAnimation()
  }

  func finishLandings() {
    for animator in Array(landingAnimators.values) {
      animator.stopAnimation(false)
      animator.finishAnimation(at: .end)
    }
  }

  /// Scaled from its top corner on its side (or top middle), then moved.
  private static func transform(scale: CGFloat, shift: CGFloat, origin: String, size: CGSize) -> CGAffineTransform {
    // Transforms apply about the center; the anchor is relative to it.
    let anchorX: CGFloat = origin == "end" ? size.width / 2 : origin == "middle" ? 0 : -size.width / 2
    let anchorY = -size.height / 2
    return CGAffineTransform(translationX: anchorX, y: anchorY + shift)
      .scaledBy(x: scale, y: scale)
      .translatedBy(x: -anchorX, y: -anchorY)
  }

  /// JavaScript's menu (a React Native modal) may be presented a moment
  /// after the lift starts: the lifted part stays above it.
  private func keepOnTop(_ overlay: UIView, in window: UIWindow) {
    for delay in [0.0, 0.05, 0.15, 0.3] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak overlay, weak window] in
        guard let overlay, let window, overlay.superview === window else { return }
        window.bringSubviewToFront(overlay)
      }
    }
  }
}
