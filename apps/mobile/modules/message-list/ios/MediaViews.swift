import UIKit

// Photos and videos: one alone, several in a carousel (stacked) or a deck of
// cards (bubbles), as on the `t3/stacked-media-carousel` branch.

/// One photo or video: the image (a video's poster), a play badge and its
/// length for videos, and a pulse while it uploads.
final class MediaTileView: UIView {
  let image = UIImageView()
  private let play = UIView()
  private let playGlyph = UIImageView()
  private let duration = UILabel()
  private let durationBack = UIView()
  private(set) var item: MediaItem?

  override init(frame: CGRect) {
    super.init(frame: frame)
    // The image rounds its own layer: a mask over a container would be
    // drawn offscreen every frame.
    layer.cornerRadius = Metrics.mediaRadius
    layer.cornerCurve = .continuous
    image.contentMode = .scaleAspectFill
    image.clipsToBounds = true
    image.layer.cornerRadius = Metrics.mediaRadius
    image.layer.cornerCurve = .continuous
    addSubview(image)
    play.backgroundColor = UIColor.black.withAlphaComponent(0.4)
    play.layer.cornerRadius = 24
    playGlyph.image = UIImage(systemName: "play.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24))
    playGlyph.tintColor = .white
    playGlyph.contentMode = .center
    play.addSubview(playGlyph)
    addSubview(play)
    durationBack.backgroundColor = UIColor.black.withAlphaComponent(0.5)
    duration.textColor = .white
    duration.textAlignment = .center
    addSubview(durationBack)
    addSubview(duration)
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ item: MediaItem, theme: Theme, size: CGSize, badges: Bool = true, blur: CGFloat = 0) {
    let changed = item.id != self.item?.id
    self.item = item
    backgroundColor = theme.fill
    if changed { image.image = nil }
    // The same item at a new URL (uploaded, now its thumbnail) keeps
    // showing what it has until the new one loads.
    Images.load(image, item.displayUrl, size: size, placeholder: changed ? nil : image.image, blur: blur)
    let video = item.kind == .video && badges
    play.isHidden = !video
    if video, let seconds = item.durationSeconds {
      let font = UIFont.systemFont(ofSize: theme.text(12), weight: .semibold)
      if duration.font != font { duration.font = font }
      duration.isHidden = false
      durationBack.isHidden = false
      let total = Int(seconds.rounded())
      duration.text = String(format: "%d:%02d", total / 60, total % 60)
    } else {
      duration.isHidden = true
      durationBack.isHidden = true
    }
    if item.uploading {
      if layer.animation(forKey: "pulse") == nil {
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.8
        pulse.duration = 0.7
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        layer.add(pulse, forKey: "pulse")
      }
    } else {
      layer.removeAnimation(forKey: "pulse")
    }
    accessibilityLabel = item.kind == .video ? "Video" : "Photo"
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    image.frame = bounds
    play.frame = CGRect(x: (bounds.width - 48) / 2, y: (bounds.height - 48) / 2, width: 48, height: 48)
    playGlyph.frame = play.bounds
    // 20 tall at the default text size, and taller with larger text.
    let height = max(20, ceil(duration.font.lineHeight) + 6)
    let size = duration.sizeThatFits(CGSize(width: bounds.width, height: height))
    durationBack.frame = CGRect(x: 8, y: bounds.height - 8 - height, width: size.width + 16, height: height)
    durationBack.layer.cornerRadius = height / 2
    duration.frame = durationBack.frame
  }
}

/// Several photos in a stacked row: a strip the row's full width, so cards
/// scroll past the photo column to the screen's edge, each card with its
/// own reactions under it. It scrolls as any scroll view does, and a swipe
/// settles on the card nearest where it would have stopped by itself.
final class CarouselView: UIScrollView, UIScrollViewDelegate {
  private var tiles: [MediaTileView] = []
  private let chips = ReactionPool<ChipView>()
  private(set) var layout: CarouselLayout?
  /// Where the reader left it, so a recycled row comes back the same.
  var onOffset: ((CGFloat) -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    alwaysBounceHorizontal = true
    // The system's own deceleration: a fling travels as far as any scroll
    // view's, then settles on a card (`scrollViewWillEndDragging`).
    decelerationRate = .normal
    scrollsToTop = false
    delegate = self
    clipsToBounds = true
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ layout: CarouselLayout, theme: Theme, offset: CGFloat, animated: Bool) {
    let sameItems = self.layout?.items.map(\.id) == layout.items.map(\.id)
    self.layout = layout
    while tiles.count < layout.items.count {
      let tile = MediaTileView()
      addSubview(tile)
      tiles.append(tile)
    }
    for (index, tile) in tiles.enumerated() {
      guard index < layout.items.count else {
        tile.isHidden = true
        continue
      }
      // A photo out in the menu (Lift.swift) is placed as it comes back.
      guard tile.superview === self else { continue }
      tile.isHidden = false
      tile.frame = layout.cards[index]
      tile.set(layout.items[index], theme: theme, size: layout.cards[index].size)
    }
    chips.update(
      layout.chips, id: \.id, frame: \.frame, in: self, animated: animated,
      make: { ChipView() }, set: { $0.set($1, theme: theme) },
      popIn: { Pop.popIn($0, duration: 0.28, overshoot: 1.06, delay: 0.15) },
      popOut: { Pop.popOut($0, duration: 0.14) }
    )
    contentSize = CGSize(width: layout.contentWidth, height: bounds.height)
    if !sameItems {
      // Another row: stop any fling left over from the last one.
      setContentOffset(contentOffset, animated: false)
    }
    if !sameItems || !isTracking && !isDecelerating {
      let maxOffset = max(0, layout.contentWidth - bounds.width)
      contentOffset = CGPoint(x: min(offset, maxOffset), y: 0)
    }
  }

  /// The card at a point in this view's bounds.
  func index(at point: CGPoint) -> Int? {
    layout?.cards.firstIndex { $0.contains(point) }
  }

  /// A card's photo, which a hold lifts into the menu alone (Lift.swift).
  func tile(_ index: Int) -> MediaTileView? {
    guard let layout, index < layout.items.count, index < tiles.count else { return nil }
    return tiles[index]
  }

  func chipView(_ id: String) -> ChipView? {
    chips.views[id]
  }

  func cardFrame(_ index: Int) -> CGRect? {
    guard let layout, index < layout.cards.count else { return nil }
    return layout.cards[index]
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    onOffset?(contentOffset.x)
  }

  /// Settles on the card nearest where the swipe would have stopped
  /// (`CarouselLayout.settle`); the last cards settle with the strip's end
  /// at the screen's, fully on screen.
  func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
    guard let layout else { return }
    let maxOffset = max(0, layout.contentWidth - bounds.width)
    targetContentOffset.pointee.x = layout.settle(
      projected: targetContentOffset.pointee.x, current: contentOffset.x, velocity: velocity.x, maxOffset: maxOffset
    )
  }
}

/// One card of a deck: the photo, its blurred copy (faded in as the card
/// goes down the pile, so the blur changes smoothly), a dim, and the
/// tapbacks of its item, shown while it's in front.
final class DeckCardView: UIView {
  let tile = MediaTileView()
  private let blurred = UIImageView()
  private let dim = UIView()
  /// Hides the tapbacks while the card is lifted into the menu (`DeckView.
  /// tapbacksHidden`); `tapbackBox` inside it fades them with depth.
  let tapbackShell = UIView()
  private let tapbackBox = UIView()
  private let tapbacks = ReactionPool<TapbackView>()
  private(set) var item: Int = -1

  override init(frame: CGRect) {
    super.init(frame: frame)
    blurred.contentMode = .scaleAspectFill
    blurred.clipsToBounds = true
    blurred.layer.cornerRadius = Metrics.mediaRadius
    blurred.layer.cornerCurve = .continuous
    dim.layer.cornerRadius = Metrics.mediaRadius
    dim.layer.cornerCurve = .continuous
    dim.isUserInteractionEnabled = false
    tapbackBox.isUserInteractionEnabled = false
    tapbackShell.isUserInteractionEnabled = false
    tapbackShell.addSubview(tapbackBox)
    [tile, blurred, dim, tapbackShell].forEach(addSubview)
    // Turned, the cards' straight edges would step: each layer that draws
    // an edge smooths it. Only the few cards of a pile pay for it.
    for layer in [tile.layer, tile.image.layer, blurred.layer, dim.layer] {
      layer.allowsEdgeAntialiasing = true
    }
    isUserInteractionEnabled = false
    // Turned and scaled about its bottom center, as a photo on a pile.
    layer.anchorPoint = CGPoint(x: 0.5, y: 1)
  }

  required init?(coder: NSCoder) { fatalError() }

  /// `tapbacks` are in the deck's coordinates, over this card at rest at
  /// `top`.
  func set(_ media: MediaItem, item: Int, size: CGSize, top: CGFloat, tapbacks layouts: [TapbackLayout], theme: Theme, animated: Bool) {
    self.item = item
    tile.set(media, theme: theme, size: size)
    // Blurred once at half size (SDWebImage caches it that way): the same
    // 4-point blur as the React Native design, for a quarter of the pixels.
    Images.load(blurred, media.displayUrl, size: CGSize(width: size.width / 2, height: size.height / 2), blur: 2)
    dim.backgroundColor = theme.background.withAlphaComponent(0.15)
    tapbacks.update(
      layouts, id: \.id, frame: { $0.frame.offsetBy(dx: 0, dy: -top) }, in: tapbackBox, animated: animated,
      make: { TapbackView() }, set: { $0.set($1, theme: theme) },
      popIn: { Pop.popIn($0, duration: 0.32, overshoot: 1.12) },
      popOut: { Pop.popOut($0, duration: 0.16) }
    )
    tapbacks.bringToFront(order: layouts.sorted { $0.zIndex < $1.zIndex }.map(\.id))
  }

  func tapbackView(_ id: String) -> TapbackView? { tapbacks.views[id] }

  /// The card at a pose: placed (inside an animation, if any) and blurred,
  /// dimmed, and showing its tapbacks as deep as it is.
  func apply(_ pose: DeckPose) {
    transform = CGAffineTransform(translationX: pose.x, y: pose.y).rotated(by: pose.angle).scaledBy(x: pose.scale, y: pose.scale)
    alpha = pose.alpha
    let behind = min(1, max(0, pose.depth))
    blurred.alpha = behind
    dim.alpha = behind
    tapbackBox.alpha = max(0, 1 - behind * 3)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    tile.frame = bounds
    blurred.frame = bounds
    dim.frame = bounds
    tapbackShell.frame = bounds
    tapbackBox.frame = bounds
  }
}

/// Several photos in a bubble: a pile of cards (`DeckPile`). The next
/// photo is behind on the right and the one before behind on the left,
/// their corners showing. Swipe left and the front card goes out with the
/// finger and tucks in behind on the left as the next comes forward;
/// swipe right for the one before. Each undoes the other, like flipping
/// through a pile of photos. The front card's own reactions sit on it.
final class DeckView: UIView, UIGestureRecognizerDelegate {
  private var cards: [Int: DeckCardView] = [:]
  private var spare: [DeckCardView] = []
  private var dots: [UIView] = []
  private(set) var layout: DeckLayout?
  private(set) var index = 0
  private var theme = Theme()
  /// With two photos, the side the one behind is on: where the last went.
  private var lone: DeckPile.Side = .right
  /// Bumped on every new deck or settle, so an animation that ends after
  /// the deck shows another row (or moved on) doesn't touch it.
  private var generation = 0
  private var settling = false
  private lazy var pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
  private let tick = UISelectionFeedbackGenerator()
  var onIndex: ((Int) -> Void)?

  private static let throwAway: CGFloat = 70
  private static let spring = UISpringTimingParameters(mass: 1, stiffness: 240, damping: 18, initialVelocity: .zero)
  /// A thrown card's trip (`DeckPile.throwOut`, `tuckIn`): out beside the
  /// pile, then in behind it, about 0.28 s in all, as on Android.
  private static let tuck = UICubicTimingParameters(animationCurve: .easeInOut)
  /// Whether the tapbacks are hidden, while the front card is lifted.
  private var tapbacksHidden = false
  /// A throw's animators, while it runs (`finishNow` stops them).
  private var throwing: [UIViewPropertyAnimator] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    pan.delegate = self
    addGestureRecognizer(pan)
  }

  required init?(coder: NSCoder) { fatalError() }

  /// The card in front (for taps, holds, and the lift).
  var front: UIView { cards[index] ?? self }

  /// Card `item`'s view, if the pile shows it: the front one lifts alone.
  func cardView(_ item: Int) -> DeckCardView? { cards[item] }

  /// Hides the cards' tapbacks at once while the front card is in the
  /// menu, and fades them back in after it lands (`Tapbacks`' `hidden`,
  /// RETURN_MS 260): the menu draws its own.
  func setTapbacksHidden(_ hidden: Bool, fade: Double) {
    tapbacksHidden = hidden
    for card in cards.values {
      card.tapbackShell.layer.removeAllAnimations()
      if hidden || fade <= 0 {
        card.tapbackShell.alpha = hidden ? 0 : 1
      } else {
        UIView.animate(withDuration: fade, delay: 0, options: [.allowUserInteraction]) { card.tapbackShell.alpha = 1 }
      }
    }
  }

  func tapbackView(_ id: String) -> TapbackView? { cards[index]?.tapbackView(id) }

  func set(_ layout: DeckLayout, theme: Theme, index: Int, animated: Bool = false) {
    let sameItems = self.layout?.items.map(\.id) == layout.items.map(\.id)
    let index = min(max(0, index), max(0, layout.items.count - 1))
    self.layout = layout
    self.theme = theme
    // The same deck, mid-drag or settling, or just updated (a reaction):
    // its cards stay where they are and only their content changes.
    if sameItems, pan.state == .began || pan.state == .changed || settling || index == self.index {
      refreshContent(animated: animated)
      return
    }
    // Another deck (a recycled row): a throw still going is the old one's.
    stopThrow()
    settling = false
    generation += 1
    self.index = index
    lone = .right
    rebuild()
  }

  private var count: Int { layout?.items.count ?? 0 }
  private var cardWidth: CGFloat { layout?.sizes.first?.width ?? Metrics.deckWidth }

  private func role(_ item: Int) -> DeckPile.Role {
    DeckPile.role(of: item, front: index, count: count, lone: lone)
  }

  private static func z(_ role: DeckPile.Role) -> CGFloat {
    switch role {
    case .front: return 0
    case .behind: return -1
    case .hidden: return -2
    }
  }

  /// Makes sure the pile's cards exist; returns those just made.
  @discardableResult
  private func ensureCards() -> [Int] {
    let shown = DeckPile.shown(front: index, count: count)
    var added: [Int] = []
    for item in shown where cards[item] == nil {
      let card = spare.popLast() ?? DeckCardView()
      card.isHidden = false
      card.tapbackShell.alpha = tapbacksHidden ? 0 : 1
      if card.superview !== self { insertSubview(card, at: 0) }
      cards[item] = card
      added.append(item)
    }
    if !added.isEmpty { refreshContent(animated: false) }
    return added
  }

  /// Makes the cards the pile shows, at rest.
  private func rebuild() {
    for card in cards.values { card.layer.removeAllAnimations() }
    let shown = DeckPile.shown(front: index, count: count)
    for (item, card) in cards where !shown.contains(item) {
      card.isHidden = true
      spare.append(card)
      cards[item] = nil
    }
    ensureCards()
    refreshContent(animated: false)
    UIView.performWithoutAnimation { rest(except: nil) }
    updateDots()
  }

  private func refreshContent(animated: Bool) {
    guard let layout else { return }
    // A card out in the menu (Lift.swift) is left alone until it's back.
    for (item, card) in cards where item < layout.items.count && card.superview === self {
      let size = layout.sizes[item]
      let frame = layout.cardFrame(item)
      UIView.performWithoutAnimation {
        card.bounds = CGRect(origin: .zero, size: size)
        // `center` is the anchor: the card's bottom center.
        card.center = CGPoint(x: frame.midX, y: frame.maxY)
      }
      // Outside it: a tapback taken back shrinks away.
      card.set(layout.items[item], item: item, size: size, top: frame.minY,
               tapbacks: item < layout.tapbacks.count ? layout.tapbacks[item] : [], theme: theme, animated: animated)
    }
  }

  /// Every card at its place in the pile (inside the caller's animation).
  private func rest(except skipped: Int?) {
    for (item, card) in cards where item != skipped {
      let role = role(item)
      card.layer.zPosition = Self.z(role)
      card.apply(DeckPile.pose(role))
    }
  }

  private func updateDots() {
    guard let layout else { return }
    let count = min(layout.items.count, 12)
    while dots.count < count {
      let dot = UIView()
      dot.layer.cornerRadius = 3
      dot.layer.zPosition = 10
      addSubview(dot)
      dots.append(dot)
    }
    let total = CGFloat(count) * 6 + CGFloat(max(0, count - 1)) * 4
    let width = layout.sizes.indices.contains(index) ? layout.sizes[index].width : cardWidth
    for (offset, dot) in dots.enumerated() {
      dot.isHidden = offset >= count
      dot.frame = CGRect(x: (width - total) / 2 + CGFloat(offset) * 10, y: layout.dotsY, width: 6, height: 6)
      dot.backgroundColor = offset == index % max(1, count) ? theme.foreground : theme.muted.withAlphaComponent(0.4)
    }
  }

  /// A finger down during a throw ends it at once, so quick flicks chain
  /// and every swipe starts from a pile at rest.
  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    if gesture === pan, settling { finishNow() }
    return true
  }

  private func finishNow() {
    settling = false
    generation += 1
    stopThrow()
    rebuild()
  }

  /// Stops a throw's animators where they are, without their completions:
  /// the pile is rebuilt at rest right after.
  private func stopThrow() {
    for animator in throwing where animator.state == .active { animator.stopAnimation(true) }
    throwing = []
  }

  override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    // UIKit asks this about every gesture starting on the deck, the list's
    // scrolling included: only the deck's own drag is decided here.
    guard gesture === pan else { return super.gestureRecognizerShouldBegin(gesture) }
    guard count > 1 else { return false }
    let velocity = pan.velocity(in: self)
    return abs(velocity.x) > abs(velocity.y)
  }

  // MARK: Dragging

  /// The pile partway through a swipe (`x`, the finger's travel): the
  /// front card follows the finger, turning as it goes, and the card that
  /// will replace it (behind on the side being uncovered) comes forward.
  private func follow(_ x: CGFloat) {
    let coming = DeckPile.front(after: index, forward: x < 0, count: count)
    let progress = min(1, abs(x) / (cardWidth * DeckPile.reveal))
    for (item, card) in cards {
      if item == index {
        card.layer.zPosition = 1
        card.apply(DeckPose(x: x, angle: (12 * .pi / 180) * x / 200))
      } else if item == coming, x != 0 {
        card.layer.zPosition = 0
        card.apply(DeckPile.mix(DeckPile.pose(role(item)), DeckPile.front, progress))
      } else {
        let role = role(item)
        card.layer.zPosition = Self.z(role)
        card.apply(DeckPile.pose(role))
      }
    }
  }

  @objc private func dragged(_ pan: UIPanGestureRecognizer) {
    let x = pan.translation(in: self).x
    switch pan.state {
    case .began:
      // (A throw still going ended as the finger came down.)
      if settling { finishNow() }
      tick.prepare()
    case .changed:
      follow(x)
    case .ended, .cancelled:
      let velocity = pan.velocity(in: self).x
      let fling = abs(velocity) >= 600 && (x == 0 || velocity.sign == x.sign)
      let thrown = pan.state == .ended && (abs(x) >= Self.throwAway || fling)
      if thrown {
        settle(forward: (abs(x) >= Self.throwAway ? x : velocity) < 0, from: x, speed: abs(velocity))
      } else {
        let animator = UIViewPropertyAnimator(duration: 0.4, timingParameters: Self.spring)
        animator.addAnimations { self.rest(except: nil) }
        animator.startAnimation()
      }
    default:
      break
    }
  }

  /// The swipe goes through: the front card carries on out with the
  /// finger to just beside the pile, decelerating (sooner the faster the
  /// finger went), drops to the back there, where nothing overlaps it, and
  /// tucks in behind on that side, as the card it uncovered comes forward
  /// and the rest move a place. Changing its order only while it's out to
  /// the side means it never comes back over the pile and then flickers
  /// behind it.
  private func settle(forward: Bool, from x: CGFloat = 0, speed: CGFloat = 0) {
    let n = count
    guard n > 1 else { return }
    let mover = index
    let side: DeckPile.Side = forward ? .left : .right
    index = DeckPile.front(after: index, forward: forward, count: n)
    lone = side
    onIndex?(index)
    tick.selectionChanged()
    settling = true
    generation += 1
    let generation = self.generation
    // Cards new to the pile come in hidden on the side they'll sit.
    let added = ensureCards()
    UIView.performWithoutAnimation {
      for item in added {
        let role = role(item)
        cards[item]?.layer.zPosition = Self.z(role)
        cards[item]?.apply(DeckPile.pose(role).with(alpha: 0))
      }
    }
    updateDots()

    // Both moves end before the pile is rebuilt at rest.
    var running = 2
    let ended = { [weak self] in
      running -= 1
      if running == 0 { self?.finishSettle(generation) }
    }
    let others = UIViewPropertyAnimator(duration: DeckPile.throwOut(distance: 0, speed: 0) + DeckPile.tuckIn,
                                        timingParameters: UISpringTimingParameters(dampingRatio: 1))
    others.addAnimations { self.rest(except: mover) }
    others.addCompletion { _ in ended() }
    throwing = [others]
    others.startAnimation()

    guard let card = cards[mover] else { return ended() }
    let sign: CGFloat = forward ? -1 : 1
    let out = DeckPose(x: sign * DeckPile.out(width: cardWidth), angle: sign * 12 * .pi / 180)
    let home = DeckPile.pose(role(mover))
    card.layer.zPosition = 1
    let throwOut = UIViewPropertyAnimator(duration: DeckPile.throwOut(distance: abs(out.x - x), speed: speed), curve: .easeOut) {
      card.apply(out)
    }
    throwOut.addCompletion { [weak self] _ in
      guard let self, generation == self.generation else { return ended() }
      // Beside the pile: behind it from here on.
      card.layer.zPosition = Self.z(.behind(side))
      let tuckIn = UIViewPropertyAnimator(duration: DeckPile.tuckIn, timingParameters: Self.tuck)
      tuckIn.addAnimations { card.apply(home) }
      tuckIn.addCompletion { _ in ended() }
      self.throwing.append(tuckIn)
      tuckIn.startAnimation()
    }
    throwing.append(throwOut)
    throwOut.startAnimation()
  }

  private func finishSettle(_ generation: Int) {
    guard generation == self.generation else { return }
    settling = false
    throwing = []
    rebuild()
  }
}

extension DeckPose {
  func with(alpha: CGFloat) -> DeckPose {
    var pose = self
    pose.alpha = alpha
    return pose
  }
}
