import UIKit

// The list's cells, one class per row kind. The list is flipped (newest at
// the bottom), so each cell flips its content back. Cells are recycled:
// configuring one sets frames and content from its row's precomputed
// layout, reusing the part views it already has.

/// What cells share: the theme and state that outlives a recycled cell.
final class ListState {
  var theme = Theme()
  var behavior = Behavior()
  /// Where each carousel was left, by row and block.
  var carouselOffsets: [String: CGFloat] = [:]
  /// The front card of each deck, by row and block.
  var deckIndices: [String: Int] = [:]
  /// Highlighted rows whose tint has already faded.
  var highlightsShown: Set<String> = []
  /// How far the list is dragged left to reveal times.
  var reveal: CGFloat = 0
  var liftedRowId: String?
  /// Custom rows' React views, by row ID (CustomRows.swift).
  var customRows: [String: CustomRowView] = [:]
}

/// What a tap or hold landed on.
struct Hit {
  var event: [String: Any]
  /// The part's frame, in the cell's content view.
  var frame: CGRect
  var view: UIView?
}

class RowCell: UICollectionViewCell {
  private(set) var rowId: String?

  override init(frame: CGRect) {
    super.init(frame: frame)
    // The list is upside down; turn the content back.
    contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
    contentView.clipsToBounds = false
    clipsToBounds = false
  }

  required init?(coder: NSCoder) { fatalError() }

  /// Sets the row. `animated` is true when this is the same row updating
  /// on screen, inside the list's animation.
  func configure(_ row: Row, _ layout: RowLayout, state: ListState, animated: Bool) {
    rowId = row.id
    contentView.alpha = state.liftedRowId == row.id ? 0 : 1
  }

  func setReveal(_ reveal: CGFloat) {}

  /// VoiceOver's double tap: the row's main action.
  var onActivate: (() -> Void)?

  override func accessibilityActivate() -> Bool {
    guard let onActivate else { return false }
    onActivate()
    return true
  }

  func hit(at point: CGPoint, hold: Bool) -> Hit? { nil }


  override func prepareForReuse() {
    super.prepareForReuse()
    Self.removeAnimations(contentView.layer)
  }

  private static func removeAnimations(_ layer: CALayer) {
    layer.removeAllAnimations()
    layer.sublayers?.forEach(removeAnimations)
  }

  /// A new row fades in as it rises into place.
  func fadeIn(duration: Double) {
    let fade = CABasicAnimation(keyPath: "opacity")
    fade.fromValue = 0
    fade.toValue = 1
    fade.duration = duration
    fade.timingFunction = CAMediaTimingFunction(controlPoints: 0.25, 0.1, 0.25, 1)
    contentView.layer.add(fade, forKey: "fadeIn")
  }
}

// MARK: Message

final class MessageCell: RowCell {
  private let highlight = UIView()
  /// Everything but the revealed time; your own rows slide left in it.
  private let body = UIView()
  /// The parts, dimmed while sending.
  private let parts = UIView()
  private let name = TextView()
  private let headerTime = TextView()
  private let avatar = AvatarView()
  private let revealTime = TextView()
  private let replyCurve = LineView()
  /// The message's tapbacks, over its parts; hidden while a part is lifted.
  private let tapbackBox = UIView()
  private let tapbacks = ReactionPool<TapbackView>()
  private let chips = ReactionPool<ChipView>()

  private var bubbles: [BubbleView] = []
  private var tiles: [MediaTileView] = []
  private var carousels: [CarouselView] = []
  private var decks: [DeckView] = []
  private var files: [FileView] = []
  private var cards: [LinkCardView] = []
  private var quotes: [QuoteView] = []
  private var quoteLines: [QuoteLineView] = []
  private var footers: [FooterView] = []

  /// The view drawn for each part, in order.
  private var partViews: [UIView] = []
  /// Part of this message is lifted into the menu (see Lift.swift): an
  /// update waits until it's back.
  var isLifted = false {
    didSet { applyPending() }
  }
  /// Growing out of the typing bubble (`grow`): an update to the same row
  /// (its status, a read mark) waits until it has, rather than cutting the
  /// morph short.
  private var isGrowing = false {
    didSet { applyPending() }
  }

  private func applyPending() {
    guard !isLifted, !isGrowing, let (row, layout, state) = pendingConfigure else { return }
    pendingConfigure = nil
    configure(row, layout, state: state, animated: false)
  }

  /// The views out in the menu (Lift.swift), which updates leave alone.
  var outViews: Set<ObjectIdentifier> = []
  /// What the row last drew, which `reseat` draws again.
  private var shown: (Row, RowLayout, ListState)?
  private var landing = false

  /// The menu is closing and the held part is about to land: an update
  /// that waited while it was out (a reaction picked in the menu, say)
  /// goes in now, animated over the landing (`duration`), so the row
  /// opens or closes around the part in one move instead of snapping
  /// once it's back. The part itself then lands where the update puts it
  /// (`liftPieces(frameOnly:)` reads the new layout).
  func beginLanding(duration: Double) {
    guard isLifted, let (row, layout, state) = pendingConfigure else { return }
    pendingConfigure = nil
    landing = true
    let animator = UIViewPropertyAnimator(duration: duration, timingParameters: UICubicTimingParameters(
      controlPoint1: CGPoint(x: 0.25, y: 0.1), controlPoint2: CGPoint(x: 0.25, y: 1)
    ))
    animator.addAnimations { self.configure(row, layout, state: state, animated: true) }
    animator.startAnimation()
    landing = false
  }

  /// The held part is back in the row (Lift.swift put its views home):
  /// the row is drawn once more from what it last showed, without
  /// animation, so the returned views take everything an update gave the
  /// row while they were out. A deck's front card gets its new tapbacks
  /// and photo, a carousel's photo its new image, a bubble its edited
  /// text, and a part its frame in the new layout, which is where it just
  /// landed, so nothing moves. Everything else already is as drawn: the
  /// landing's update (`beginLanding`) finished as the part landed. The
  /// tapbacks stay hidden until the lifter fades them back.
  func reseat(_ views: [UIView]) {
    outViews = []
    guard let (row, layout, state) = shown else { return }
    landing = true
    configure(row, layout, state: state, animated: false)
    landing = false
  }
  private var pendingConfigure: (Row, RowLayout, ListState)?
  var bodyView: UIView { body }
  private(set) var layout: MessageLayout?
  private(set) var message: MessageRow?
  private var theme: Theme?

  override init(frame: CGRect) {
    super.init(frame: frame)
    highlight.isUserInteractionEnabled = false
    contentView.addSubview(highlight)
    contentView.addSubview(body)
    body.addSubview(parts)
    body.addSubview(replyCurve)
    body.addSubview(name)
    body.addSubview(headerTime)
    body.addSubview(avatar)
    tapbackBox.isUserInteractionEnabled = false
    body.addSubview(tapbackBox)
    contentView.addSubview(revealTime)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    let bounds = contentView.bounds
    highlight.frame = bounds
    body.bounds = bounds
    body.center = CGPoint(x: bounds.midX, y: bounds.midY)
    parts.frame = body.bounds
    tapbackBox.frame = body.bounds
  }

  override func configure(_ row: Row, _ rowLayout: RowLayout, state: ListState, animated: Bool) {
    guard let message = row.message, case let .message(layout) = rowLayout else { return }
    let sameRow = rowId == row.id
    if isLifted && !landing || isGrowing, sameRow {
      pendingConfigure = (row, rowLayout, state)
      return
    }
    if !sameRow, isGrowing {
      // Recycled mid-grow: drop it.
      partViews.first?.layer.removeAllAnimations()
      (partViews.first as? BubbleView)?.endGrow()
      isGrowing = false
    }
    super.configure(row, rowLayout, state: state, animated: animated)
    shown = (row, rowLayout, state)
    if !sameRow, !isLifted { setTapbacksHidden(false, fade: 0) }
    let animate = animated && sameRow
    let theme = state.theme
    self.theme = theme
    self.layout = layout
    self.message = message
    let apply = {
      self.place(row.id, message, layout, state: state, animated: animate)
    }
    if animate { apply() } else { UIView.performWithoutAnimation(apply) }
    accessibilityLabel = message.accessibilityLabel
    isAccessibilityElement = true
    highlightIfNeeded(row.id, message, state: state, theme: theme, sameRow: sameRow)
    setReveal(state.reveal)
  }

  private func place(_ rowId: String, _ message: MessageRow, _ layout: MessageLayout, state: ListState, animated: Bool) {
    let theme = state.theme
    let bounds = CGRect(x: 0, y: 0, width: contentView.bounds.width, height: layout.height)
    body.bounds = bounds
    body.center = CGPoint(x: bounds.midX, y: bounds.midY)
    parts.frame = bounds
    tapbackBox.frame = bounds
    highlight.frame = bounds
    parts.alpha = message.status == .sending ? 0.5 : 1

    /// A view that was hidden (or is new) takes its place without flying in
    /// from wherever it last was, fading in if the row is animating; one
    /// already showing moves within the animation.
    func show(_ view: UIView, _ configure: () -> Void) {
      // A part out in the menu is placed when it's back (`reseat`).
      if outViews.contains(ObjectIdentifier(view)) { return }
      guard view.isHidden else { return configure() }
      UIView.performWithoutAnimation(configure)
      view.isHidden = false
      if animated {
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.duration = 0.2
        view.layer.add(fade, forKey: "show")
      }
    }

    // The sender's name and photo, and a stacked row's time.
    if let box = layout.name {
      show(name) {
        name.text = box.string
        name.frame = box.frame
      }
    } else {
      name.isHidden = true
    }
    if let box = layout.headerTime {
      show(headerTime) {
        headerTime.text = box.string
        headerTime.frame = box.frame
      }
      headerTime.alpha = message.status == nil ? 1 : 0
    } else {
      headerTime.isHidden = true
    }
    if let (person, frame) = layout.avatar {
      show(avatar) {
        // Placed at full size; `recede` scales it after.
        avatar.transform = .identity
        avatar.frame = frame
        avatar.set(person, size: frame.width, theme: theme)
      }
    } else {
      avatar.isHidden = true
    }

    // The parts, reusing views of each kind in order.
    var used: [ObjectIdentifier: Int] = [:]
    func take<V: UIView>(_ pool: inout [V], make: () -> V) -> V {
      let key = ObjectIdentifier(V.self)
      let index = used[key, default: 0]
      used[key] = index + 1
      if index < pool.count { return pool[index] }
      let view = make()
      view.isHidden = true
      pool.append(view)
      parts.addSubview(view)
      return view
    }
    var views: [UIView] = []
    var receding: CGFloat = 0
    for part in layout.parts {
      let key = "\(rowId)#\(part.blockIndex)"
      switch part.content {
      case let .text(box, bubble, _):
        let view = take(&bubbles) { BubbleView() }
        show(view) {
          view.frame = part.frame
          view.set(box, bubble: bubble)
        }
        views.append(view)
      case let .media(item, _):
        let view = take(&tiles) { MediaTileView() }
        show(view) {
          view.frame = part.frame
          view.set(item, theme: theme, size: part.frame.size)
        }
        views.append(view)
      case let .carousel(carousel):
        let view = take(&carousels) { CarouselView() }
        show(view) {
          view.frame = part.frame
          view.onOffset = nil
          view.set(carousel, theme: theme, offset: state.carouselOffsets[key] ?? 0, animated: animated)
        }
        // The first carousel may pass under the author's photo.
        let recedes = !views.contains { $0 is CarouselView }
        if recedes { receding = view.contentOffset.x }
        view.onOffset = { [weak state, weak self] offset in
          state?.carouselOffsets[key] = offset
          if recedes { self?.recede(offset) }
        }
        views.append(view)
      case let .deck(deck):
        let view = take(&decks) { DeckView() }
        show(view) {
          view.frame = part.frame
          view.set(deck, theme: theme, index: state.deckIndices[key] ?? 0, animated: animated)
          view.onIndex = { [weak state] index in state?.deckIndices[key] = index }
        }
        views.append(view)
      case let .file(nameBox, sizeBox, icon, _):
        let view = take(&files) { FileView() }
        show(view) {
          view.frame = part.frame
          view.set(name: nameBox, size: sizeBox, icon: icon, theme: theme)
        }
        views.append(view)
      case let .linkCard(card):
        let view = take(&cards) { LinkCardView() }
        show(view) {
          view.frame = part.frame
          view.set(card, theme: theme)
        }
        views.append(view)
      case let .quote(author, text, thumbnail, url, _):
        let view = take(&quotes) { QuoteView() }
        show(view) {
          view.frame = part.frame
          view.set(author: author, text: text, thumbnail: thumbnail, url: url, theme: theme)
        }
        views.append(view)
      case let .quoteLine(face, person, text, elbow, _):
        let view = take(&quoteLines) { QuoteLineView() }
        show(view) {
          view.frame = part.frame
          view.set(face: face, person: person, text: text, elbow: elbow, theme: theme)
        }
        views.append(view)
      }
    }
    let pooled: [UIView] = bubbles + tiles + carousels + decks + files + cards + quotes + quoteLines
    for view in pooled where !views.contains(where: { $0 === view }) {
      view.isHidden = true
    }
    partViews = views
    recede(receding)

    if let frame = layout.replyCurve {
      show(replyCurve) {
        replyCurve.frame = frame
        replyCurve.set(.replyCurve(message.isOwn ? .right : .left), color: theme.separator)
      }
    } else {
      replyCurve.isHidden = true
    }

    // Lines under the message.
    for (index, piece) in layout.footer.enumerated() {
      if index >= footers.count {
        let view = FooterView()
        view.isHidden = true
        footers.append(view)
        parts.addSubview(view)
      }
      show(footers[index]) { footers[index].set(piece, theme: theme) }
    }
    for view in footers.dropFirst(layout.footer.count) { view.isHidden = true }

    // Reactions: tapbacks over the corner, or chips under the message.
    tapbacks.update(
      layout.tapbacks, id: \.id, frame: \.frame, in: tapbackBox, animated: animated,
      make: { TapbackView() }, set: { $0.set($1, theme: theme) },
      popIn: { Pop.popIn($0, duration: 0.32, overshoot: 1.12) },
      popOut: { Pop.popOut($0, duration: 0.16) }
    )
    tapbacks.bringToFront(order: layout.tapbacks.sorted { $0.zIndex < $1.zIndex }.map(\.id))
    chips.update(
      layout.chips, id: \.id, frame: \.frame, in: body, animated: animated,
      make: { ChipView() }, set: { $0.set($1, theme: theme) },
      // The space opens first, then the chips appear in it.
      popIn: { Pop.popIn($0, duration: 0.28, overshoot: 1.06, delay: state.behavior.moveMs / 2000) },
      popOut: { Pop.popOut($0, duration: 0.14) }
    )

    if let box = layout.revealTime {
      show(revealTime) {
        revealTime.text = box.string
        revealTime.frame = box.frame
      }
    } else {
      revealTime.isHidden = true
    }
    accessibilityCustomActions = nil
  }

  private func highlightIfNeeded(_ rowId: String, _ message: MessageRow, state: ListState, theme: Theme, sameRow: Bool) {
    highlight.backgroundColor = theme.highlight
    // Already fading on this row: let it finish.
    if sameRow, highlight.layer.animationKeys() != nil { return }
    highlight.layer.removeAllAnimations()
    guard message.highlighted, !state.highlightsShown.contains(rowId) else {
      highlight.alpha = 0
      return
    }
    state.highlightsShown.insert(rowId)
    // Holds for 0.8 s, then fades over 1.6 s. Core Animation, not
    // UIView.animate: the first rows arrive inside React Native's prop
    // update, which turns UIView animations off.
    highlight.alpha = 0
    let fade = CAKeyframeAnimation(keyPath: "opacity")
    fade.values = [1, 1, 0]
    fade.keyTimes = [0, NSNumber(value: 0.8 / 2.4), 1]
    fade.timingFunctions = [CAMediaTimingFunction(name: .linear), CAMediaTimingFunction(name: .easeInEaseOut)]
    fade.duration = 2.4
    highlight.layer.add(fade, forKey: "highlight")
  }

  /// A stacked carousel's cards scroll under the author's photo
  /// (`avatarRecede`): it shrinks toward its top center to clear them,
  /// and grows back as they return (`MessageLayout.avatarScale`).
  private func recede(_ offset: CGFloat) {
    let size = layout?.avatarScale(carouselOffset: offset) ?? 1
    guard size < 1 else {
      if avatar.transform != .identity { avatar.transform = .identity }
      return
    }
    let height = avatar.bounds.height
    avatar.transform = CGAffineTransform(translationX: 0, y: -height * (1 - size) / 2).scaledBy(x: size, y: size)
  }

  override func setReveal(_ reveal: CGFloat) {
    let reveal = message?.layout == .bubbles ? reveal : 0
    revealTime.alpha = reveal / Metrics.revealWidth(theme ?? Theme())
    revealTime.transform = CGAffineTransform(translationX: -reveal, y: 0)
    body.transform = layout?.slides == true ? CGAffineTransform(translationX: -reveal, y: 0) : .identity
  }

  /// A message from someone typing grows out of their indicator, as
  /// bubble-morph.tsx draws it: its bubble starts as the typing bubble
  /// (`typing`, in the row's coordinates; both rows sit at the bottom) and
  /// stretches to its own size from its tail's corner over 320 ms, the
  /// tail riding along; the dots fade in the first third; then the text
  /// fades in over 220 ms, so it never spills out of the bubble.
  func grow(from typing: CGRect, dots: UIColor) {
    guard let bubble = partViews.first as? BubbleView else { return }
    let final = bubble.frame
    let start = CGRect(x: typing.minX, y: final.maxY - typing.height, width: typing.width, height: typing.height)
    isGrowing = true
    bubble.grow(from: body.convert(start, to: bubble.superview), dots: dots) { [weak self] in
      self?.isGrowing = false
    }
  }

  // MARK: Lifting into the menu

  /// The held part (by the `part` and `index` a hold reported), in the
  /// message's coordinates. `frameOnly` asks just where it goes (while its
  /// views are out). A part this message doesn't have lifts nothing,
  /// rather than some other part (a caption) in its place. Its tapbacks
  /// stay, hidden while it's up (`setTapbacksHidden`): the menu draws its
  /// own, and nothing from the list goes over the menu.
  func liftPieces(part: String?, index: Int?, frameOnly: Bool = false) -> LiftPieces? {
    guard let layout, let at = layout.liftedPart(part, index: index) else { return nil }
    let held = layout.parts[at]
    if case let .carousel(carousel) = held.content {
      // A carousel's card lifts alone: its photo, not the strip with its
      // neighbors. Its chips stay under it, as the React Native menu
      // lifts just the photo (`MediaCopy`). The frame is the card's as
      // drawn now, the one the hold reported and the menu laid out from.
      // No card named, or no photo for it: nothing lifts.
      guard let card = carousel.liftedItem(part: part, index: index, blockPart: held.part),
            let strip = at < partViews.count ? partViews[at] as? CarouselView : nil,
            let frame = carousel.cardFrame(card, offset: strip.contentOffset.x, in: held.frame) else { return nil }
      if frameOnly { return LiftPieces(frame: frame, views: []) }
      guard let tile = strip.tile(card) else { return nil }
      return LiftPieces(frame: frame, views: [tile])
    }
    if case let .deck(deck) = held.content {
      // A deck's front card lifts alone, never the pile behind it, framed
      // where it rests in front: the frame the hold reported.
      let stack = at < partViews.count ? partViews[at] as? DeckView : nil
      let card = stack?.index ?? index ?? 0
      guard card >= 0, card < deck.items.count else { return nil }
      let frame = deck.cardFrame(card).offsetBy(dx: held.frame.minX, dy: held.frame.minY)
      if frameOnly { return LiftPieces(frame: frame, views: []) }
      guard let view = stack?.cardView(card) else { return nil }
      return LiftPieces(frame: frame, views: [view])
    }
    if frameOnly { return LiftPieces(frame: held.frame, views: []) }
    guard at < partViews.count else { return nil }
    var pieces = LiftPieces(frame: held.frame, views: [partViews[at]])
    if case let .text(_, bubble, _) = held.content, bubble?.fill == nil, bubble?.border == nil {
      pieces.card = theme?.backgroundElevated
    }
    return pieces
  }

  /// Hides the row's tapbacks (its own and its decks' cards') at once as a
  /// part lifts into the menu, and fades them back in over `fade` once
  /// it's back, as the React Native list's `Tapbacks` do (RETURN_MS 260).
  func setTapbacksHidden(_ hidden: Bool, fade: Double) {
    tapbackBox.layer.removeAllAnimations()
    if hidden || fade <= 0 {
      tapbackBox.alpha = hidden ? 0 : 1
    } else {
      UIView.animate(withDuration: fade, delay: 0, options: [.allowUserInteraction]) { self.tapbackBox.alpha = 1 }
    }
    for deck in decks { deck.setTapbacksHidden(hidden, fade: fade) }
  }

  /// A deck's front card at rest, in the body: where a hold on it lifts
  /// from, whatever pose a swipe left it in.
  private func frontCard(_ stack: DeckView, _ deck: DeckLayout) -> CGRect {
    deck.cardFrame(stack.index).offsetBy(dx: stack.frame.minX, dy: stack.frame.minY)
  }

  // MARK: Taps and holds

  override func hit(at point: CGPoint, hold: Bool) -> Hit? {
    guard let layout, let message, let rowId else { return nil }
    let point = body.convert(point, from: contentView)
    var base: [String: Any] = ["rowId": rowId]

    func press(_ target: String, _ extra: [String: Any] = [:], frame: CGRect, view: UIView? = nil) -> Hit {
      var event = base
      event["type"] = hold ? "hold" : "press"
      if !hold { event["element"] = target }
      for (key, value) in extra { event[key] = value }
      return Hit(event: event, frame: body.convert(frame, to: contentView), view: view)
    }

    if let (reaction, view) = reaction(inBody: point) {
      // A tap toggles it or shows who reacted; a hold shows who reacted
      // (a hold's `element` and `reactionKey`). Both report the part it's
      // on, with a media item's `index`, and that part's frame
      // (MessageListView adds it to a press as `frame`), so JavaScript
      // lifts or opens the menu on exactly that item, and older JavaScript
      // does what it did. The reaction shrinks under the finger.
      let held = holdTarget(part: reaction.part)
      var extra: [String: Any] = ["reactionKey": reaction.key, "part": reaction.part]
      if let index = held?.index { extra["index"] = index }
      if hold { extra["element"] = "reaction" }
      return press(hold ? "hold" : "reaction", extra, frame: held?.frame ?? reaction.frame, view: view)
    }

    if !hold {
      if let (_, frame) = layout.avatar, frame.insetBy(dx: -4, dy: -4).contains(point) {
        return press("author", ["accountId": message.author.id], frame: frame)
      }
      if let name = layout.name, name.frame.insetBy(dx: -4, dy: -4).contains(point) {
        return press("author", ["accountId": message.author.id], frame: name.frame)
      }
      for (index, piece) in layout.footer.enumerated() where index < footers.count {
        if footers[index].frame.insetBy(dx: -4, dy: -6).contains(point) {
          switch piece {
          case .replies: return press("replies", frame: footers[index].frame)
          case .notSent: return press("notSent", frame: footers[index].frame)
          case .edited: break
          }
        }
      }
    }

    for (index, part) in layout.parts.enumerated() where index < partViews.count {
      let view = partViews[index]
      guard part.frame.contains(point) else { continue }
      if let id = part.part { base["part"] = id }
      let local = view.convert(point, from: body)
      switch part.content {
      case .text:
        if !hold, let bubble = view as? BubbleView,
           let span = bubble.text.spanIndex(at: bubble.text.convert(local, from: bubble)),
           case let .text(spans, _, _) = message.blocks[part.blockIndex], span < spans.count {
          let span = spans[span]
          if span.style == .link { return press("link", ["url": span.url ?? span.text], frame: part.frame, view: view) }
          if span.style == .mention { return press("mention", ["accountId": span.accountId ?? ""], frame: part.frame, view: view) }
        }
        return press("message", frame: part.frame, view: view)
      case let .media(item, _):
        return press("media", ["index": 0, "part": item.part], frame: part.frame, view: view)
      case let .carousel(carousel):
        guard let strip = view as? CarouselView else { break }
        let inStrip = strip.convert(point, from: body)
        if let card = strip.index(at: inStrip), let frame = strip.cardFrame(card) {
          return press("media", ["index": card, "part": carousel.items[card].part], frame: strip.convert(frame, to: body), view: view)
        }
        return nil
      case let .deck(deck):
        guard let stack = view as? DeckView else { break }
        let card = stack.index
        return press("media", ["index": card, "part": deck.items[card].part], frame: frontCard(stack, deck), view: stack.front)
      case let .file(_, _, _, url):
        return press("file", ["url": url], frame: part.frame, view: view)
      case let .linkCard(card):
        return press("linkCard", ["url": card.card.url], frame: part.frame, view: view)
      case let .quote(_, _, _, _, messageId), let .quoteLine(_, _, _, _, messageId):
        return press("quote", ["messageId": messageId], frame: part.frame, view: view)
      }
    }
    if message.layout == .stacked || hold && layout.bounds.contains(point) {
      // A stacked row is one target, edge to edge: a press beside its text
      // (or between its parts) is on the part at that height, or the
      // nearest one.
      let nearest = layout.parts.indices.min { a, b in
        Self.distance(point.y, layout.parts[a].frame) < Self.distance(point.y, layout.parts[b].frame)
      }
      if let at = nearest, case .text = layout.parts[at].content {
        var event = base
        if let id = layout.parts[at].part { event["part"] = id }
        base = event
        return press("message", frame: layout.parts[at].frame, view: at < partViews.count ? partViews[at] : nil)
      }
      return press("message", frame: hold ? layout.bounds : body.bounds)
    }
    return nil
  }

  /// The reaction under a point in the body's coordinates (its frame
  /// there too), and its view: a tapback or chip of the message, a chip
  /// under a carousel's card, or a tapback on a deck's front card.
  private func reaction(inBody point: CGPoint) -> (ReactionHit, UIView?)? {
    guard let layout else { return nil }
    if let hit = layout.reaction(at: point) {
      return (hit, hit.kind == .tapback ? tapbacks.views[hit.id] : chips.views[hit.id])
    }
    for (index, part) in layout.parts.enumerated() where index < partViews.count {
      switch part.content {
      case .carousel:
        guard part.frame.contains(point), let strip = partViews[index] as? CarouselView,
              let chip = strip.layout?.chip(at: strip.convert(point, from: body)) else { continue }
        let hit = ReactionHit(kind: .chip, id: chip.id, part: chip.part, key: chip.reaction.key, mine: chip.reaction.mine,
                              frame: strip.convert(chip.frame, to: body))
        return (hit, strip.chipView(chip.id))
      case .deck:
        // Tapbacks stand above the deck's top: not only inside its frame.
        guard let deck = partViews[index] as? DeckView,
              let tapback = deck.layout?.tapback(at: deck.convert(point, from: body), front: deck.index) else { continue }
        let hit = ReactionHit(kind: .tapback, id: tapback.id, part: tapback.part, key: tapback.reaction.key,
                              mine: tapback.reaction.mine, frame: deck.convert(tapback.frame, to: body))
        return (hit, deck.tapbackView(tapback.id))
      default:
        continue
      }
    }
    return nil
  }

  /// Whether a point in the content view is on a reaction, which a tap
  /// toggles at once with its own recognizer and haptic.
  func reaction(at point: CGPoint) -> ReactionHit? {
    reaction(inBody: body.convert(point, from: contentView))?.0
  }

  /// The part a reaction belongs to (`MessageLayout.target`), with its
  /// frame in the body: a carousel item's card, a deck's front card, or
  /// the part.
  private func holdTarget(part: String) -> (index: Int?, frame: CGRect)? {
    guard let layout, let (at, index) = layout.target(forPart: part) else { return nil }
    let view = at < partViews.count ? partViews[at] : nil
    switch layout.parts[at].content {
    case .carousel:
      if let index, let strip = view as? CarouselView, let card = strip.cardFrame(index) { return (index, strip.convert(card, to: body)) }
    case let .deck(deck):
      if let stack = view as? DeckView { return (index, frontCard(stack, deck)) }
    default:
      break
    }
    return (index, layout.parts[at].frame)
  }

  /// How far `y` is from a frame's span (0 inside it).
  private static func distance(_ y: CGFloat, _ frame: CGRect) -> CGFloat {
    y < frame.minY ? frame.minY - y : y > frame.maxY ? y - frame.maxY : 0
  }

  // MARK: Accessibility

  /// The part the message's own reactions belong to: its text.
  static func messagePart(_ message: MessageRow) -> String {
    for block in message.blocks {
      if case let .text(_, _, part) = block { return part ?? "message" }
    }
    return message.blocks.first?.part ?? "message"
  }

  func accessibilityActions(send: @escaping ([String: Any]) -> Void) -> [UIAccessibilityCustomAction] {
    guard let message, let rowId else { return [] }
    var actions: [UIAccessibilityCustomAction] = []
    func action(_ name: String, _ event: [String: Any]) {
      var event = event
      event["type"] = "press"
      event["rowId"] = rowId
      if let target = event.removeValue(forKey: "target") { event["element"] = target }
      actions.append(UIAccessibilityCustomAction(name: name) { _ in send(event); return true })
    }
    for block in message.blocks {
      switch block {
      case let .text(spans, _, _):
        for span in spans {
          if span.style == .link {
            action(span.text, ["target": "link", "url": span.url ?? span.text])
          } else if span.style == .mention, let accountId = span.accountId {
            action(span.text, ["target": "mention", "accountId": accountId])
          }
        }
      case let .media(items, _):
        for (index, item) in items.enumerated() {
          action(item.kind == .video ? "Video \(index + 1)" : "Photo \(index + 1)", ["target": "media", "index": index, "part": item.part])
          for reaction in item.reactions {
            action("\(reaction.label) \(reaction.count), \(item.kind == .video ? "video" : "photo") \(index + 1)",
                   ["target": "reaction", "reactionKey": reaction.key, "part": item.part])
          }
        }
      case let .file(name, _, url, _):
        action(name, ["target": "file", "url": url])
      case let .linkCard(card):
        action(card.title ?? card.site, ["target": "linkCard", "url": card.url])
      case let .quote(author, _, _, messageId, _):
        action(author.name, ["target": "quote", "messageId": messageId])
      default:
        break
      }
    }
    for reaction in message.reactions {
      action("\(reaction.label) \(reaction.count)", ["target": "reaction", "reactionKey": reaction.key, "part": Self.messagePart(message)])
    }
    for line in message.footer where line.kind != .edited {
      action(line.text, ["target": line.kind == .replies ? "replies" : "notSent"])
    }
    return actions
  }
}

/// A line under a message: "2 replies" with faces, "Edited", "Not sent".
final class FooterView: UIView {
  private let label = TextView()
  private let icon = UIImageView()
  private let chevron = UIImageView()
  private var faces: [AvatarView] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    icon.image = UIImage(systemName: "exclamationmark.circle.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12))
    icon.contentMode = .center
    chevron.image = UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 10, weight: .bold))
    chevron.contentMode = .center
    addSubview(icon)
    addSubview(chevron)
    addSubview(label)
  }

  required init?(coder: NSCoder) { fatalError() }

  func set(_ piece: FooterPiece, theme: Theme) {
    icon.isHidden = true
    chevron.isHidden = true
    backgroundColor = nil
    faces.forEach { $0.isHidden = true }
    switch piece {
    case let .edited(box):
      frame = box.frame
      label.text = box.string
      label.frame = bounds
    case let .notSent(frame, iconFrame, box):
      self.frame = frame
      icon.isHidden = false
      icon.tintColor = theme.destructive
      icon.frame = iconFrame
      label.text = box.string
      label.frame = box.frame
    case let .replies(frame, people, box, pill, chevronFrame):
      self.frame = frame
      if pill {
        backgroundColor = theme.fill
        layer.cornerRadius = frame.height / 2
      }
      while faces.count < people.count {
        let face = AvatarView()
        insertSubview(face, belowSubview: label)
        faces.append(face)
      }
      // The first face is on top.
      for (index, (person, faceFrame)) in people.enumerated() {
        let face = faces[index]
        face.isHidden = false
        face.frame = faceFrame
        face.set(person, size: faceFrame.width, theme: theme, ring: 1)
        sendSubviewToBack(face)
      }
      label.text = box.string
      label.frame = box.frame
      if let chevronFrame {
        chevron.isHidden = false
        chevron.tintColor = theme.muted
        chevron.frame = chevronFrame
      }
    }
  }
}

// MARK: Headers, notices, fallbacks

final class TextRowCell: RowCell {
  private let label = TextView()
  private let leftRule = CAGradientLayer()
  private let rightRule = CAGradientLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.addSubview(label)
    leftRule.startPoint = CGPoint(x: 0, y: 0.5)
    leftRule.endPoint = CGPoint(x: 1, y: 0.5)
    rightRule.startPoint = CGPoint(x: 1, y: 0.5)
    rightRule.endPoint = CGPoint(x: 0, y: 0.5)
    contentView.layer.addSublayer(leftRule)
    contentView.layer.addSublayer(rightRule)
    isAccessibilityElement = true
  }

  required init?(coder: NSCoder) { fatalError() }

  override func configure(_ row: Row, _ layout: RowLayout, state: ListState, animated: Bool) {
    super.configure(row, layout, state: state, animated: animated)
    var rules = HeaderRules.none
    let box: TextBox
    switch layout {
    case let .header(text, _, hasRules):
      box = text
      rules = hasRules
      accessibilityTraits = .header
    case let .notice(text, _), let .fallback(text, _):
      box = text
      accessibilityTraits = .staticText
    default:
      return
    }
    UIView.performWithoutAnimation {
      label.text = box.string
      label.frame = box.frame
    }
    accessibilityLabel = box.string.string
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    leftRule.isHidden = rules != .day
    rightRule.isHidden = rules == .none
    if rules == .replies {
      rightRule.opacity = 1
      rightRule.colors = [state.theme.separator.cgColor, state.theme.separator.cgColor]
      rightRule.frame = CGRect(x: box.frame.maxX + 12, y: box.frame.midY,
                               width: max(0, contentView.bounds.width - 16 - box.frame.maxX - 12),
                               height: 1 / (window?.screen.scale ?? UIScreen.main.scale))
    } else if rules == .day {
      // Strongest next to the label, fading out toward the edges.
      let colors = [state.theme.separator.withAlphaComponent(0).cgColor, state.theme.separator.cgColor]
      leftRule.opacity = 0.6
      rightRule.opacity = 0.6
      leftRule.colors = colors
      rightRule.colors = colors
      let y = box.frame.midY
      let pad = state.theme.horizontalPadding
      leftRule.frame = CGRect(x: pad, y: y, width: max(0, box.frame.minX - 12 - pad), height: 1)
      rightRule.frame = CGRect(x: box.frame.maxX + 12, y: y, width: max(0, contentView.bounds.width - pad - box.frame.maxX - 12), height: 1)
    }
    CATransaction.commit()
  }
}

// MARK: Typing

final class TypingCell: RowCell {
  private let bubble = BubbleView()
  private var faces: [String: RingedAvatarView] = [:]
  private let overflow = TextView()
  private let overflowBack = UIView()
  private let label = TextView()
  private let dots = (0..<3).map { _ in UIView() }
  private var layout: TypingLayout?

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.addSubview(overflowBack)
    contentView.addSubview(overflow)
    contentView.addSubview(bubble)
    contentView.addSubview(label)
    dots.forEach(contentView.addSubview)
    isAccessibilityElement = true
  }

  required init?(coder: NSCoder) { fatalError() }

  override func configure(_ row: Row, _ rowLayout: RowLayout, state: ListState, animated: Bool) {
    guard case let .typing(layout) = rowLayout, case let .typing(_, people, label, _) = row.content else { return }
    let changing = animated && rowId == row.id
    super.configure(row, rowLayout, state: state, animated: animated)
    self.layout = layout
    let theme = state.theme
    let moving: [UIView] = Array(faces.values) + [bubble, overflow, overflowBack, self.label] + dots
    let positions = moving.map { ($0, $0.layer.presentation()?.position ?? $0.layer.position, $0.isHidden) }
    let oldLabel = changing ? fadingText(self.label, next: layout.label?.string) : nil
    let oldCount = changing ? fadingText(overflow, next: layout.overflow?.string) : nil
    let nextIds = Set(layout.faces.map { $0.0.id })
    for id in Array(faces.keys) where !nextIds.contains(id) {
      guard let face = faces.removeValue(forKey: id) else { continue }
      if changing {
        Self.zoom(face, entering: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.154) { face.removeFromSuperview() }
      } else {
        face.removeFromSuperview()
      }
    }
    UIView.performWithoutAnimation {
      for (person, frame) in layout.faces {
        let added = faces[person.id] == nil
        let face = faces[person.id] ?? RingedAvatarView()
        faces[person.id] = face
        if added { contentView.insertSubview(face, at: 0) }
        face.isHidden = false
        face.frame = frame.insetBy(dx: -layout.faceRing, dy: -layout.faceRing)
        face.set(person, size: frame.width, theme: theme, ring: layout.faceRing)
        if added && changing { Self.zoom(face, entering: true) }
      }
      // The first face is on top, and the count under them all.
      for (person, _) in layout.faces {
        if let face = faces[person.id] { contentView.sendSubviewToBack(face) }
      }
      contentView.sendSubviewToBack(overflow)
      contentView.sendSubviewToBack(overflowBack)
      if let box = layout.overflow {
        overflow.isHidden = false
        overflowBack.isHidden = false
        overflow.text = box.string
        overflow.frame = box.frame.insetBy(dx: 0, dy: (box.frame.height - 16) / 2)
        // A chip in the bubble color, ringed like the faces (`Faces`' more).
        overflowBack.frame = box.frame
        overflowBack.backgroundColor = theme.bubbleIncoming
        overflowBack.layer.cornerRadius = box.frame.height / 2
        overflowBack.layer.borderWidth = layout.faceRing
        overflowBack.layer.borderColor = theme.background.cgColor
      } else {
        overflow.isHidden = true
        overflowBack.isHidden = true
      }
      if let frame = layout.bubble {
        bubble.isHidden = false
        bubble.frame = frame
        bubble.set(TextBox(string: NSAttributedString(), frame: .zero), bubble: BubbleStyle(fill: theme.bubbleIncoming, border: nil, radius: frame.height / 2, tail: .left))
      } else {
        bubble.isHidden = true
      }
      if let box = layout.label {
        self.label.isHidden = false
        self.label.text = box.string
        self.label.frame = box.frame
      } else {
        self.label.isHidden = true
      }
      for (index, dot) in dots.enumerated() {
        dot.frame = layout.dots[index]
        dot.layer.cornerRadius = layout.dots[index].width / 2
        dot.backgroundColor = theme.muted
      }
    }
    if changing {
      for (view, from, wasHidden) in positions where !wasHidden && !view.isHidden && view.superview != nil {
        let to = view.layer.position
        if from != to {
          let shift = CABasicAnimation(keyPath: "position")
          shift.fromValue = NSValue(cgPoint: from)
          shift.toValue = NSValue(cgPoint: to)
          shift.duration = 0.22
          shift.timingFunction = CAMediaTimingFunction(name: .linear)
          view.layer.add(shift, forKey: "typingShift")
        }
      }
      for (view, old) in [(self.label, oldLabel), (overflow, oldCount)] {
        guard let old else { continue }
        Self.fade(view, from: 0, to: 1, duration: 0.22)
        Self.fade(old, from: 1, to: 0, duration: 0.154)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.154) { old.removeFromSuperview() }
      }
    }
    accessibilityLabel = label.isEmpty ? people.map(\.name).joined(separator: ", ") : label
    animateDots()
  }

  /// typing-parts.tsx: CHANGE_MS 220, exits at 70% of that duration.
  private static func fade(_ view: UIView, from: Float, to: Float, duration: Double) {
    let fade = CABasicAnimation(keyPath: "opacity")
    fade.fromValue = from
    fade.toValue = to
    fade.duration = duration
    view.layer.opacity = to
    view.layer.add(fade, forKey: "typingChange")
  }

  private static func zoom(_ view: UIView, entering: Bool) {
    let zoom = CABasicAnimation(keyPath: "transform.scale")
    zoom.fromValue = entering ? 0 : 1
    zoom.toValue = entering ? 1 : 0
    zoom.duration = entering ? 0.22 : 0.154
    zoom.fillMode = .forwards
    zoom.isRemovedOnCompletion = entering
    view.layer.add(zoom, forKey: "typingFace")
  }

  /// Keep just the old name/count while the new text crossfades in.
  private func fadingText(_ text: TextView, next: NSAttributedString?) -> UIView? {
    guard !text.isHidden, let previous = text.text, let next, previous.string != next.string else { return nil }
    let old = TextView(frame: text.frame)
    old.text = previous
    contentView.addSubview(old)
    return old
  }

  /// 1300 ms loop: each dot brightens and grows in turn.
  private func animateDots() {
    let now = CACurrentMediaTime()
    for (index, dot) in dots.enumerated() {
      if dot.layer.animation(forKey: "typing") != nil { continue }
      let opacity = CAKeyframeAnimation(keyPath: "opacity")
      opacity.values = [0.35, 1, 0.35, 0.35]
      let scale = CAKeyframeAnimation(keyPath: "transform.scale")
      scale.values = [0.85, 1.05, 0.85, 0.85]
      for animation in [opacity, scale] {
        animation.keyTimes = [0, 0.25, 0.5, 1]
        animation.timingFunctions = Array(repeating: CAMediaTimingFunction(name: .easeInEaseOut), count: 3)
      }
      let group = CAAnimationGroup()
      group.animations = [opacity, scale]
      group.duration = 1.3
      group.repeatCount = .infinity
      group.beginTime = now + Double(index) * 0.26
      group.fillMode = .backwards
      group.isRemovedOnCompletion = false
      dot.layer.add(group, forKey: "typing")
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    dots.forEach { $0.layer.removeAnimation(forKey: "typing") }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, layout != nil { animateDots() }
  }

  /// Appearing: grows from its bottom-left corner.
  func appear() {
    let anchor = CGPoint(x: layout?.bubble?.minX ?? 16, y: layout?.height ?? contentView.bounds.height)
    let view = contentView
    view.alpha = 0
    let size = view.bounds.size
    let dx = anchor.x - size.width / 2
    let dy = anchor.y - size.height / 2
    // Scale about the anchor, inside the cell's flip.
    let flip = CGAffineTransform(scaleX: 1, y: -1)
    view.transform = flip.translatedBy(x: dx, y: dy).scaledBy(x: 0.75, y: 0.75).translatedBy(x: -dx, y: -dy)
    UIView.animate(withDuration: 0.315, delay: 0.105, options: [.allowUserInteraction]) {
      view.alpha = 1
      view.transform = flip
    }
  }

}
