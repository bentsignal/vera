import UIKit

// Every row's height and the frames of everything in it, computed from data
// (text sizes, media dimensions) before a cell ever shows it. This runs off
// the main thread and is cached per row and width, so a cell only sets
// frames and content. The numbers match the React Native list
// (features/conversation): see .plans/native-message-list.md.

/// Text with the frame it's drawn in (relative to its container).
struct TextBox {
  var string: NSAttributedString
  var frame: CGRect
  var lines: Int = 0
}

enum Side { case left, right }

struct BubbleStyle {
  var fill: UIColor?
  var border: UIColor?
  var radius: CGFloat
  /// The side the tail is drawn on, or nil for none.
  var tail: Side?
}

struct TapbackLayout {
  /// Unique within the row: the reaction part, key, and copy.
  var id: String
  var part: String
  var reaction: Reaction
  var tinted: Bool
  var frame: CGRect
  var zIndex: Int
}

struct ChipLayout {
  var id: String
  var part: String
  var reaction: Reaction
  var text: TextBox
  var frame: CGRect
}

struct CarouselLayout {
  var items: [MediaItem]
  /// Each card's frame in the strip's content. The strip is the row's full
  /// width, so cards scroll past the photo column to the screen's edge; at
  /// rest the first starts `leadingInset` in, where the row's text does.
  var cards: [CGRect]
  var chips: [ChipLayout]
  var contentWidth: CGFloat
  var leadingInset: CGFloat

  /// The offset that puts a card's left edge where the row's text starts.
  func offset(of card: Int) -> CGFloat {
    cards[card].minX - leadingInset
  }

  /// Where a swipe settles: the card whose resting place is nearest where
  /// the scroll would have come to rest by itself (`projected`), so a hard
  /// fling travels several cards and a slow one one. Moving forward never
  /// settles behind where it was let go, and back never ahead.
  func settle(projected: CGFloat, current: CGFloat, velocity: CGFloat, maxOffset: CGFloat) -> CGFloat {
    guard !cards.isEmpty else { return 0 }
    let starts = cards.indices.map { min(offset(of: $0), maxOffset) }
    var target = starts.indices.min { abs(starts[$0] - projected) < abs(starts[$1] - projected) } ?? 0
    if velocity > 0.05, starts[target] < current, target + 1 < starts.count { target += 1 }
    if velocity < -0.05, starts[target] > current, target > 0 { target -= 1 }
    return starts[target]
  }

  /// The card a hold or lift is about (contract: `Lift.part`/`index`, as
  /// the hold reported them): `index` when it's in range and that item is
  /// the held part (or the block is), otherwise the item whose part it is.
  /// Nil when neither names a card: the caller lifts no single card then.
  func liftedItem(part: String?, index: Int?, blockPart: String?) -> Int? {
    if let index, items.indices.contains(index), part == nil || items[index].part == part || blockPart == part {
      return index
    }
    guard let part else { return nil }
    return items.firstIndex { $0.part == part }
  }

  /// A card's frame in the coordinates the strip is placed in, with the
  /// strip at `partFrame` scrolled `offset` in: where the card is drawn,
  /// which is the frame a hold on it reports.
  func cardFrame(_ index: Int, offset: CGFloat, in partFrame: CGRect) -> CGRect? {
    guard cards.indices.contains(index) else { return nil }
    return cards[index].offsetBy(dx: partFrame.minX - offset, dy: partFrame.minY)
  }

  /// The reaction chip at a point in the strip's content.
  func chip(at point: CGPoint) -> ChipLayout? {
    chips.first { $0.frame.insetBy(dx: -4, dy: -4).contains(point) }
  }
}

struct DeckLayout {
  var items: [MediaItem]
  /// Each card's size. Every card is centered in the height of the deck's
  /// tallest (`tallest`, under `cardTop`), at the box's left, so the pile
  /// keeps its height whichever card is in front.
  var sizes: [CGSize]
  var cardTop: CGFloat
  var tallest: CGFloat
  var dotsY: CGFloat
  /// Each card's own tapbacks, over its top corner while it's in front, in
  /// the deck's coordinates.
  var tapbacks: [[TapbackLayout]] = []

  /// Where card `item` rests in front, in the deck's coordinates.
  func cardFrame(_ item: Int) -> CGRect {
    guard item >= 0, item < sizes.count else { return .zero }
    let size = sizes[item]
    return CGRect(x: 0, y: cardTop + ((tallest - size.height) / 2).rounded(), width: size.width, height: size.height)
  }

  /// The front card's tapback at a point in the deck's coordinates.
  func tapback(at point: CGPoint, front: Int) -> TapbackLayout? {
    guard front < tapbacks.count else { return nil }
    return tapbacks[front].reversed().first { $0.frame.insetBy(dx: -6, dy: -6).contains(point) }
  }
}

/// A reaction a tap or hold landed on.
struct ReactionHit: Equatable {
  enum Kind { case tapback, chip }
  var kind: Kind
  /// Its layout's `id`, for its view.
  var id: String
  var part: String
  var key: String
  var mine: Bool
  /// In the coordinates it was found in.
  var frame: CGRect
}

struct LinkCardLayout {
  var card: Block.LinkCard
  var image: CGRect?
  var site: TextBox?
  var title: TextBox?
  var description: TextBox?
  /// A link with no preview: a link icon beside its host and address.
  var icon: CGRect?
}

enum PartContent {
  /// A text bubble, plain stacked text, or jumbo emoji (no bubble).
  case text(TextBox, bubble: BubbleStyle?, spans: [Span])
  case media(MediaItem, radius: CGFloat)
  case carousel(CarouselLayout)
  case deck(DeckLayout)
  case file(name: TextBox, size: TextBox, icon: CGRect, url: String)
  case linkCard(LinkCardLayout)
  /// A reply's quote card (bubbles).
  case quote(author: TextBox, text: TextBox, thumbnail: CGRect?, thumbnailUrl: URL?, messageId: String)
  /// A reply's quote line above a stacked row: an 18pt face and one line.
  case quoteLine(face: CGRect, person: Person, text: TextBox, elbow: CGRect, messageId: String)
}

struct PartLayout {
  var frame: CGRect
  var content: PartContent
  var part: String?
  var blockIndex: Int
}

enum FooterPiece {
  case replies(frame: CGRect, faces: [(Person, CGRect)], label: TextBox, pill: Bool, chevron: CGRect?)
  case edited(TextBox)
  case notSent(frame: CGRect, icon: CGRect, label: TextBox)
}

struct MessageLayout {
  var height: CGFloat
  var parts: [PartLayout] = []
  var name: TextBox?
  var avatar: (person: Person, frame: CGRect)?
  var headerTime: TextBox?
  var tapbacks: [TapbackLayout] = []
  var chips: [ChipLayout] = []
  var footer: [FooterPiece] = []
  var replyCurve: CGRect?
  /// The time revealed by dragging the list left (bubbles).
  var revealTime: TextBox?
  /// Your own bubbles slide left as times are revealed.
  var slides = false
  /// Everything the message draws, for the frame a hold reports.
  var bounds: CGRect = .zero
  /// A stacked row's carousel that starts beside its author's photo: the
  /// scale the photo shrinks to (from its top) as cards scroll under it.
  var avatarRecede: CGFloat?

  /// Which of `parts` a lift is about (`Lift.part` and `index`): the one
  /// with that part, or the media block with an item of it. With only an
  /// `index` (an item of a group, contract `hold.index`), the first media
  /// with that many items, never a caption. With neither (a hold on a
  /// part that has none), the first part. A part the message doesn't
  /// have, or an index no media has, is nil: nothing lifts, rather than a
  /// caption or other photos in its place.
  func liftedPart(_ part: String?, index: Int? = nil) -> Int? {
    guard let part else {
      guard let index else { return parts.isEmpty ? nil : 0 }
      return parts.firstIndex { candidate in
        switch candidate.content {
        case .media: return index == 0
        case let .carousel(carousel): return index >= 0 && index < carousel.items.count
        case let .deck(deck): return index >= 0 && index < deck.items.count
        default: return false
        }
      }
    }
    return parts.firstIndex { candidate in
      if candidate.part == part { return true }
      switch candidate.content {
      case let .media(item, _): return item.part == part
      case let .carousel(carousel): return carousel.items.contains { $0.part == part }
      case let .deck(deck): return deck.items.contains { $0.part == part }
      default: return false
      }
    }
  }

  /// The part a reaction's `part` is on, as taps and holds on it report:
  /// which of `parts`, and for media, which item (`index`). The message's
  /// own reactions are on its first text, or its first part.
  func target(forPart part: String) -> (at: Int, index: Int?)? {
    for (at, candidate) in parts.enumerated() {
      switch candidate.content {
      case let .media(item, _) where item.part == part || candidate.part == part:
        return (at, 0)
      case let .carousel(carousel):
        if let index = carousel.items.firstIndex(where: { $0.part == part }) { return (at, index) }
      case let .deck(deck):
        if let index = deck.items.firstIndex(where: { $0.part == part }) { return (at, index) }
      default:
        if candidate.part == part { return (at, nil) }
      }
    }
    let text = parts.firstIndex { if case .text = $0.content { return true } else { return false } }
    return (text ?? (parts.isEmpty ? nil : 0)).map { ($0, nil) }
  }

  /// The tapback or chip at a point in the message's coordinates: the
  /// front tapback first, as drawn. Not a carousel's chips or a deck's
  /// tapbacks, which move with their cards (their views find those).
  func reaction(at point: CGPoint) -> ReactionHit? {
    for tapback in tapbacks.reversed() where tapback.frame.insetBy(dx: -6, dy: -6).contains(point) {
      return ReactionHit(kind: .tapback, id: tapback.id, part: tapback.part, key: tapback.reaction.key, mine: tapback.reaction.mine, frame: tapback.frame)
    }
    for chip in chips where chip.frame.insetBy(dx: -2, dy: -2).contains(point) {
      return ReactionHit(kind: .chip, id: chip.id, part: chip.part, key: chip.reaction.key, mine: chip.reaction.mine, frame: chip.frame)
    }
    return nil
  }
}

struct TypingLayout {
  var height: CGFloat
  var faces: [(Person, CGRect)]
  var faceRing: CGFloat
  var bubble: CGRect?
  var label: TextBox?
  var dots: [CGRect]
  var overflow: TextBox?
}

enum HeaderRules {
  case none, day, replies
}

enum RowLayout {
  case message(MessageLayout)
  case header(TextBox, height: CGFloat, rules: HeaderRules)
  case notice(TextBox, height: CGFloat)
  case typing(TypingLayout)
  case fallback(TextBox, height: CGFloat)
  /// A custom row drawn by React, as tall as React laid it out.
  case custom(height: CGFloat)

  var height: CGFloat {
    switch self {
    case let .message(layout): return layout.height
    case let .header(_, height, _), let .notice(_, height), let .fallback(_, height): return height
    case let .custom(height): return height
    case let .typing(layout): return layout.height
    }
  }
}

enum Metrics {
  static let bubbleAvatar: CGFloat = 28
  static let avatarGap: CGFloat = 10
  static let tailDrop: CGFloat = 7
  static let partGap: CGFloat = 4
  static let tapback: CGFloat = 34
  static let tapbackPeek: CGFloat = 14
  static let tapbackSpace: CGFloat = 25
  static let tapbackOverhang: CGFloat = 14
  static let nameSpace: CGFloat = 22
  static let mediaWidth: CGFloat = 240
  static let mediaMaxHeight: CGFloat = 300
  static let mediaRadius: CGFloat = 16
  static let cardWidth: CGFloat = 256
  static let replyIndent: CGFloat = 22
  static let revealWidth: CGFloat = 72
  static let chipHeight: CGFloat = 26
  static let carouselHeight: CGFloat = 200
  static let carouselGap: CGFloat = 6
  static let deckWidth: CGFloat = 220
  static let typingBubble = CGSize(width: 60, height: 38)
}

/// Measures text the way `TextView` draws it.
func measure(_ string: NSAttributedString, width: CGFloat, maxLines: Int = 0, lineHeight: CGFloat) -> CGSize {
  guard string.length > 0 else { return .zero }
  let rect = string.boundingRect(
    with: CGSize(width: max(1, width), height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    context: nil
  )
  var height = ceil(rect.height)
  if maxLines > 0 { height = min(height, CGFloat(maxLines) * lineHeight) }
  return CGSize(width: min(ceil(rect.width), width), height: max(height, lineHeight))
}

struct Measurer {
  let theme: Theme
  let width: CGFloat
  /// Custom rows React has laid out, by row ID (CustomRows.swift).
  var customHeights: [String: CGFloat] = [:]

  func layout(_ row: Row) -> RowLayout {
    switch row.content {
    case let .message(message):
      return .message(message.layout == .bubbles ? bubbles(message) : stacked(message))
    case let .header(style, label):
      switch style {
      case "time": return header(style: style, label: label)
      case "replies": return repliesHeader(label: label)
      default: return stackedHeader(label: label)
      }
    case let .notice(spans):
      return notice(spans)
    case let .typing(layout, people, label, showFaces):
      return .typing(typing(layout: layout, people: people, label: label, showFaces: showFaces))
    case let .custom(text):
      if let height = customHeights[row.id] { return .custom(height: height) }
      return fallback(text)
    case let .fallback(text):
      return fallback(text)
    }
  }

  /// Plain text in a row's place: an unknown kind, or a custom row React
  /// hasn't drawn yet.
  func fallback(_ text: String) -> RowLayout {
    let attributes = Fonts.attributes(Fonts.system(theme.caption.size), theme.muted, lineHeight: theme.caption.lineHeight, alignment: .center)
    let string = NSAttributedString(string: text, attributes: attributes)
    let size = measure(string, width: width - 64, lineHeight: theme.caption.lineHeight)
    return .fallback(TextBox(string: string, frame: CGRect(x: 32, y: 8, width: width - 64, height: size.height)), height: size.height + 16)
  }

  // MARK: Text

  func spansString(_ spans: [Span], size: CGFloat, lineHeight: CGFloat, color: UIColor, mentionColor: UIColor, italic: Bool = false) -> NSAttributedString {
    let result = NSMutableAttributedString()
    let base = Fonts.attributes(Fonts.system(size, italic: italic), color, lineHeight: lineHeight)
    for (index, span) in spans.enumerated() {
      var attributes = base
      switch span.style {
      case .bold: attributes[.font] = Fonts.system(size, .semibold)
      case .italic: attributes[.font] = Fonts.system(size, italic: true)
      case .code: attributes[.font] = UIFont.monospacedSystemFont(ofSize: size * 0.94, weight: .regular)
      case .link:
        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
        attributes[.spanIndex] = index
      case .mention:
        attributes[.font] = Fonts.system(size, .semibold)
        attributes[.foregroundColor] = mentionColor
        attributes[.spanIndex] = index
      case nil: break
      }
      result.append(NSAttributedString(string: span.text, attributes: attributes))
    }
    return result
  }

  func plain(_ text: String, _ size: CGFloat, _ color: UIColor, weight: UIFont.Weight = .regular, lineHeight: CGFloat? = nil, italic: Bool = false, alignment: NSTextAlignment = .natural, truncate: Bool = false) -> NSAttributedString {
    NSAttributedString(string: text, attributes: Fonts.attributes(
      Fonts.system(size, weight, italic: italic), color, lineHeight: lineHeight, alignment: alignment,
      lineBreak: truncate ? .byTruncatingTail : .byWordWrapping
    ))
  }

  func box(_ string: NSAttributedString, x: CGFloat, y: CGFloat, maxWidth: CGFloat, lineHeight: CGFloat, maxLines: Int = 0) -> TextBox {
    let size = measure(string, width: maxWidth, maxLines: maxLines, lineHeight: lineHeight)
    return TextBox(string: string, frame: CGRect(x: x, y: y, width: size.width, height: size.height), lines: maxLines)
  }

  // MARK: Reactions

  /// Tapbacks for a part: each person's reaction is its own, and only the
  /// newest three show, the newest in front at the corner.
  func tapbacks(_ reactions: [Reaction], part: String, over frame: CGRect, side: Side) -> [TapbackLayout] {
    var copies: [(Reaction, Bool, String)] = []
    // Only the newest three show, so only the last three copies matter.
    for reaction in reactions.suffix(3) {
      let count = max(1, reaction.count)
      for copy in max(0, count - 3)..<count {
        let tinted = reaction.mine && copy == count - 1
        copies.append((reaction, tinted, "\(part)|\(reaction.key)|\(copy)"))
      }
    }
    let shown = Array(copies.suffix(3))
    let size = Metrics.tapback
    let top = frame.minY - Metrics.tapbackSpace
    return shown.enumerated().map { index, copy in
      let behind = CGFloat(shown.count - 1 - index)
      let x: CGFloat
      if side == .right {
        // Incoming: the top-right corner, older ones toward the middle.
        x = frame.maxX + Metrics.tapbackOverhang - size - behind * Metrics.tapbackPeek
      } else {
        x = frame.minX - Metrics.tapbackOverhang + behind * Metrics.tapbackPeek
      }
      return TapbackLayout(id: copy.2, part: part, reaction: copy.0, tinted: copy.1, frame: CGRect(x: x, y: top, width: size, height: size), zIndex: index)
    }
  }

  /// The width of a tapback fan.
  func fanWidth(_ reactions: [Reaction]) -> CGFloat {
    let count = min(3, reactions.reduce(0) { $0 + max(1, $1.count) })
    return count == 0 ? 0 : Metrics.tapback + CGFloat(count - 1) * Metrics.tapbackPeek
  }

  func chipText(_ reaction: Reaction) -> NSAttributedString {
    let color = reaction.mine ? theme.accent : theme.muted
    let result = NSMutableAttributedString()
    if reaction.imageUrl == nil {
      result.append(plain(reaction.emoji ?? reaction.label, 13, color, lineHeight: 18))
      result.append(plain(" ", 4, color, lineHeight: 18))
    }
    result.append(plain("\(reaction.count)", 13, color, weight: .semibold, lineHeight: 18))
    return result
  }

  /// Chips laid out in rows that wrap within `width`, starting at the origin.
  func chips(_ reactions: [Reaction], part: String, origin: CGPoint, width: CGFloat) -> (chips: [ChipLayout], height: CGFloat) {
    guard !reactions.isEmpty else { return ([], 0) }
    var x: CGFloat = 0
    var y: CGFloat = 4
    var result: [ChipLayout] = []
    for reaction in reactions {
      let string = chipText(reaction)
      let textSize = measure(string, width: 200, lineHeight: 18)
      let imageWidth: CGFloat = reaction.imageUrl == nil ? 0 : 20
      let chipWidth = 8 + imageWidth + textSize.width + 8
      if x > 0 && x + chipWidth > width {
        x = 0
        y += Metrics.chipHeight + 4
      }
      let frame = CGRect(x: origin.x + x, y: origin.y + y, width: chipWidth, height: Metrics.chipHeight)
      let text = TextBox(string: string, frame: CGRect(x: 8 + imageWidth, y: (Metrics.chipHeight - textSize.height) / 2, width: textSize.width, height: textSize.height))
      result.append(ChipLayout(id: "\(part)|\(reaction.key)", part: part, reaction: reaction, text: text, frame: frame))
      x += chipWidth + 4
    }
    return (result, y + Metrics.chipHeight)
  }

  // MARK: Media sizes

  func mediaSize(_ item: MediaItem, maxWidth: CGFloat) -> CGSize {
    let width = min(Metrics.mediaWidth, maxWidth)
    let height = min(Metrics.mediaMaxHeight, (width * item.height / item.width).rounded())
    return CGSize(width: width, height: max(60, height))
  }

  func carouselCardSize(_ item: MediaItem) -> CGSize {
    let height = Metrics.carouselHeight
    let width = min(250, max(130, (height * item.width / item.height).rounded()))
    return CGSize(width: width, height: height)
  }

  func deckCardSize(_ item: MediaItem) -> CGSize {
    let width = Metrics.deckWidth
    return CGSize(width: width, height: min(280, max(160, (width * item.height / item.width).rounded())))
  }

  // MARK: Bubbles

  func bubbles(_ message: MessageRow) -> MessageLayout {
    let pad = theme.horizontalPadding
    let incomingGroup = !message.isOwn && message.showAuthor
    let column = incomingGroup ? Metrics.bubbleAvatar + Metrics.avatarGap : 0
    let rowWidth = width - pad * 2
    // 75% of the row inside its margins, as the React Native list's
    // `max-w-[75%]` (not rounded: a wrap there is a point narrower).
    var maxBubble = min(rowWidth * theme.bubbleMaxWidthFraction, rowWidth - column)
    let left = pad + column
    let right = width - pad
    let side: Side = message.isOwn ? .right : .left
    let tapbackSide: Side = message.isOwn ? .left : .right
    let textColor = message.isOwn ? theme.textOutgoing : theme.textIncoming
    let bubbleColor = message.isOwn ? theme.bubbleOutgoing : theme.bubbleIncoming
    let mentionColor = message.isOwn ? theme.textOutgoing : theme.accent
    let hasLinkCard = message.blocks.contains { if case .linkCard = $0 { return true } else { return false } }
    // The message's own reactions go on its text (or its first part).
    let reactionBlock = message.blocks.firstIndex { if case .text = $0 { return true } else { return false } } ?? 0
    let lastTextBlock = message.blocks.lastIndex { block in
      if case let .text(_, jumbo, _) = block { return !jumbo }
      return false
    }

    var layout = MessageLayout(height: 0)
    layout.slides = message.isOwn
    var y = message.startsGroup ? theme.runGap : theme.rowGap
    let top = y

    var nameWidth: CGFloat = 0
    if incomingGroup && message.startsGroup {
      let string = plain(message.author.name, theme.name.size, theme.muted, lineHeight: theme.name.lineHeight, truncate: true)
      let name = box(string, x: left + 12, y: 0, maxWidth: maxBubble - 24, lineHeight: theme.name.lineHeight, maxLines: 1)
      layout.name = name
      nameWidth = name.frame.width
    }

    var indent: CGFloat = 0
    var quoteFrame: CGRect?
    var bodyTop: CGFloat?
    for (index, block) in message.blocks.enumerated() {
      let first = layout.parts.isEmpty
      let reactions: [Reaction]
      var fan: CGFloat
      switch block {
      case let .media(items, _) where items.count == 1:
        reactions = items[0].reactions
        fan = fanWidth(reactions)
      case let .media(items, _):
        // A deck: each card's own, on it while it's in front (room for the
        // widest fan).
        reactions = []
        fan = items.map { fanWidth($0.reactions) }.max() ?? 0
      default:
        reactions = index == reactionBlock ? message.reactions : []
        fan = fanWidth(reactions)
      }

      // Size the part first; its x depends on its width.
      let available = maxBubble - indent
      var size: CGSize
      var content: PartContent
      var tail: Bool = false
      switch block {
      case let .text(spans, jumbo, _):
        if jumbo {
          let string = spansString(spans, size: theme.jumbo.size, lineHeight: theme.jumbo.lineHeight, color: theme.foreground, mentionColor: theme.accent)
          let text = box(string, x: 0, y: 0, maxWidth: available, lineHeight: theme.jumbo.lineHeight)
          size = text.frame.size
          content = .text(text, bubble: nil, spans: spans)
        } else {
          let string = spansString(spans, size: theme.body.size, lineHeight: theme.body.lineHeight, color: textColor, mentionColor: mentionColor)
          var text = box(string, x: 14, y: 8, maxWidth: available - 28, lineHeight: theme.body.lineHeight)
          text.frame.size.width = max(text.frame.width, 1)
          size = CGSize(width: text.frame.width + 28, height: text.frame.height + 16)
          tail = message.endsGroup && !hasLinkCard && index == lastTextBlock
          content = .text(text, bubble: BubbleStyle(fill: bubbleColor, border: nil, radius: theme.bubbleRadius, tail: tail ? side : nil), spans: spans)
        }
      case let .deleted(label, _):
        let string = plain(label, theme.body.size, theme.muted, lineHeight: theme.body.lineHeight, italic: true)
        let text = box(string, x: 14, y: 8, maxWidth: available - 28, lineHeight: theme.body.lineHeight)
        size = CGSize(width: text.frame.width + 28, height: text.frame.height + 16)
        content = .text(text, bubble: BubbleStyle(fill: nil, border: theme.separator, radius: theme.bubbleRadius, tail: nil), spans: [])
      case let .media(items, _):
        if items.count == 1 {
          size = mediaSize(items[0], maxWidth: available)
          content = .media(items[0], radius: Metrics.mediaRadius)
        } else {
          let sizes = items.map(deckCardSize)
          // The tallest of all, not just those showing: the row keeps its
          // height as the cards go round (Android does the same).
          let tallest = sizes.map(\.height).max() ?? 220
          size = CGSize(width: Metrics.deckWidth, height: 10 + tallest + 6 + 6)
          var deck = DeckLayout(items: items, sizes: sizes, cardTop: 10, tallest: tallest, dotsY: 10 + tallest + 6)
          deck.tapbacks = items.indices.map { index in
            tapbacks(items[index].reactions, part: items[index].part, over: deck.cardFrame(index), side: tapbackSide)
          }
          content = .deck(deck)
        }
      case let .file(name, sizeLabel, url, _):
        size = CGSize(width: min(Metrics.cardWidth, available), height: 64)
        let nameBox = box(plain(name, 15, theme.foreground, weight: .semibold, lineHeight: 20, truncate: true), x: 64, y: 12, maxWidth: size.width - 76, lineHeight: 20, maxLines: 1)
        let sizeBox = box(plain(sizeLabel, 13, theme.muted, lineHeight: 18, truncate: true), x: 64, y: 32, maxWidth: size.width - 76, lineHeight: 18, maxLines: 1)
        content = .file(name: nameBox, size: sizeBox, icon: CGRect(x: 12, y: 12, width: 40, height: 40), url: url)
      case let .linkCard(card):
        let card = linkCard(card, width: min(Metrics.cardWidth, available))
        size = CGSize(width: min(Metrics.cardWidth, available), height: card.height)
        content = .linkCard(card.layout)
      case let .quote(author, text, thumbnailUrl, messageId, _):
        let thumb: CGFloat = thumbnailUrl == nil ? 0 : 40
        let authorBox = box(plain(author.name, 12, theme.muted, weight: .semibold, lineHeight: 16, truncate: true), x: 12, y: 6, maxWidth: available - 24 - thumb, lineHeight: 16, maxLines: 1)
        let textBox = box(plain(text, 13, theme.muted, lineHeight: 17), x: 12, y: 22, maxWidth: available - 24 - thumb, lineHeight: 17, maxLines: 2)
        let innerHeight = 16 + textBox.frame.height
        size = CGSize(width: max(authorBox.frame.width, textBox.frame.width) + 24 + thumb, height: innerHeight + 12)
        let thumbnail = thumbnailUrl == nil ? nil : CGRect(x: size.width - 12 - 32, y: (size.height - 32) / 2, width: 32, height: 32)
        content = .quote(author: authorBox, text: textBox, thumbnail: thumbnail, thumbnailUrl: thumbnailUrl, messageId: messageId)
      case .unknown:
        continue
      }

      let x = side == .right ? right - indent - size.width : left + indent
      // Room above the part: the name, and the tapbacks over its corner.
      var above: CGFloat = first ? 0 : Metrics.partGap
      if first {
        if layout.name != nil {
          let fanLeft = x + size.width + Metrics.tapbackOverhang - fan
          let besideName = fan == 0 || fanLeft >= left + 12 + nameWidth + 6
          above = besideName ? max(Metrics.nameSpace, fan > 0 ? Metrics.tapbackSpace : 0) : Metrics.nameSpace + Metrics.tapbackSpace
        } else if fan > 0 {
          above = Metrics.tapbackSpace
        }
      } else if fan > 0 {
        above += Metrics.tapbackSpace - Metrics.partGap
      }
      y += above
      if first, layout.name != nil {
        layout.name?.frame.origin.y = y - Metrics.nameSpace
        if fan > 0, above > Metrics.tapbackSpace { layout.name?.frame.origin.y = y - above }
      }
      let frame = CGRect(x: x, y: y, width: size.width, height: size.height)
      if case .quote = content {
        quoteFrame = frame
        indent = Metrics.replyIndent
        maxBubble -= 0
      } else if quoteFrame != nil, bodyTop == nil {
        bodyTop = frame.minY
      }
      layout.parts.append(PartLayout(frame: frame, content: content, part: partId(block, message: message), blockIndex: index))
      if !reactions.isEmpty {
        layout.tapbacks += tapbacks(reactions, part: reactionPart(block, message: message), over: frame, side: tapbackSide)
      }
      y = frame.maxY + (tail ? Metrics.tailDrop : 0)
    }

    if let quoteFrame, let bodyTop {
      // The "L" from the quote down into the reply, on the reply's side.
      let x = side == .right ? right - 12 - 7 : left + 12
      layout.replyCurve = CGRect(x: x, y: quoteFrame.maxY, width: 7, height: bodyTop + 19 - quoteFrame.maxY)
    }

    // Lines under the message.
    for line in message.footer {
      switch line.kind {
      case .edited:
        let string = plain(line.text, theme.caption.size, theme.muted, lineHeight: theme.caption.lineHeight)
        var text = box(string, x: 0, y: y + 2, maxWidth: maxBubble, lineHeight: theme.caption.lineHeight, maxLines: 1)
        text.frame.origin.x = side == .right ? right - 4 - text.frame.width : left + 4
        layout.footer.append(.edited(text))
        y = text.frame.maxY
      case .notSent:
        layout.footer.append(notSent(line.text, y: y + 2, side: side, left: left, right: right, maxWidth: maxBubble))
        y += 2 + theme.caption.lineHeight
      case .replies:
        let piece = replies(line, y: y + 4, side: side, left: left, right: right, maxWidth: maxBubble, pill: false)
        layout.footer.append(piece)
        y += 4 + 18
      }
    }
    if message.status == .failed, !message.footer.contains(where: { $0.kind == .notSent }) {
      // `failed` without a footer line still says so.
      layout.footer.append(notSent("Not sent", y: y + 2, side: side, left: left, right: right, maxWidth: maxBubble))
      y += 2 + theme.caption.lineHeight
    }

    if incomingGroup && message.endsGroup {
      layout.avatar = (message.author, CGRect(x: pad, y: y - Metrics.bubbleAvatar, width: Metrics.bubbleAvatar, height: Metrics.bubbleAvatar))
    }

    // The time revealed at the right edge, beside the bubble.
    let firstTop = layout.parts.first?.frame.minY ?? top
    let time = plain(message.timeLabel, theme.caption.size, theme.muted, lineHeight: theme.caption.lineHeight, alignment: .right)
    let timeY = firstTop + (y - firstTop - theme.caption.lineHeight) / 2
    layout.revealTime = TextBox(string: time, frame: CGRect(x: width, y: max(0, timeY), width: Metrics.revealWidth - 12, height: theme.caption.lineHeight))

    layout.height = ceil(y)
    layout.bounds = layout.parts.reduce(CGRect.null) { $0.union($1.frame) }
    return layout
  }

  func notSent(_ text: String, y: CGFloat, side: Side, left: CGFloat, right: CGFloat, maxWidth: CGFloat) -> FooterPiece {
    let string = plain(text, theme.caption.size, theme.destructive, lineHeight: theme.caption.lineHeight, truncate: true)
    var label = box(string, x: 0, y: 0, maxWidth: maxWidth - 24, lineHeight: theme.caption.lineHeight, maxLines: 1)
    let width = 12 + 4 + label.frame.width
    let x = side == .right ? right - 4 - width : left + 4
    label.frame.origin.x = 16
    let icon = CGRect(x: 0, y: (theme.caption.lineHeight - 12) / 2, width: 12, height: 12)
    return .notSent(frame: CGRect(x: x, y: y, width: width, height: theme.caption.lineHeight), icon: icon, label: label)
  }

  func replies(_ line: FooterLine, y: CGFloat, side: Side, left: CGFloat, right: CGFloat, maxWidth: CGFloat, pill: Bool) -> FooterPiece {
    let faces = Array(line.people.prefix(3))
    let faceSize: CGFloat = 18
    let facesWidth = faces.isEmpty ? 0 : faceSize + CGFloat(faces.count - 1) * (faceSize - 6)
    let string = plain(line.text, 13, pill ? theme.foreground : theme.accent, weight: .semibold, lineHeight: 18, truncate: true)
    var label = box(string, x: 0, y: 0, maxWidth: maxWidth - facesWidth - 40, lineHeight: 18, maxLines: 1)
    let gap: CGFloat = faces.isEmpty ? 0 : 6
    if pill {
      let chevron: CGFloat = 6 + 8
      let width = 6 + facesWidth + gap + label.frame.width + chevron + 10
      var placed: [(Person, CGRect)] = []
      for (index, person) in faces.enumerated() {
        placed.append((person, CGRect(x: 6 + CGFloat(index) * (faceSize - 6), y: 4, width: faceSize, height: faceSize)))
      }
      label.frame.origin = CGPoint(x: 6 + facesWidth + gap, y: 4)
      let chevronFrame = CGRect(x: label.frame.maxX + 6, y: 4 + 5, width: 8, height: 8)
      return .replies(frame: CGRect(x: left, y: y, width: width, height: 26), faces: placed, label: label, pill: true, chevron: chevronFrame)
    }
    let width = facesWidth + gap + label.frame.width
    let x = side == .right ? right - width : left + 4
    var placed: [(Person, CGRect)] = []
    // Your own messages read right to left: the label, then the faces.
    let facesX: CGFloat = side == .right ? label.frame.width + gap : 0
    label.frame.origin = CGPoint(x: side == .right ? 0 : facesWidth + gap, y: 0)
    for (index, person) in faces.enumerated() {
      placed.append((person, CGRect(x: facesX + CGFloat(index) * (faceSize - 6), y: 0, width: faceSize, height: faceSize)))
    }
    return .replies(frame: CGRect(x: x, y: y, width: width, height: faceSize), faces: placed, label: label, pill: false, chevron: nil)
  }

  func linkCard(_ card: Block.LinkCard, width: CGFloat) -> (layout: LinkCardLayout, height: CGFloat) {
    var layout = LinkCardLayout(card: card)
    let noTitle = card.title?.isEmpty ?? true
    let noDescription = card.description?.isEmpty ?? true
    if card.imageUrl == nil, noTitle, noDescription {
      // No preview (link-preview-card.tsx): an icon, the host, the address.
      let textX: CGFloat = 12 + 36 + 12
      let inner = width - textX - 12
      let host = box(plain(card.site, 15, theme.foreground, weight: .semibold, lineHeight: 20, truncate: true), x: textX, y: 10, maxWidth: inner, lineHeight: 20, maxLines: 1)
      let address = box(plain(card.url, 13, theme.muted, lineHeight: 18, truncate: true), x: textX, y: 32, maxWidth: inner, lineHeight: 18, maxLines: 1)
      layout.title = host
      layout.description = address
      layout.icon = CGRect(x: 12, y: 12, width: 36, height: 36)
      return (layout, 60)
    }
    var y: CGFloat = 0
    if card.imageUrl != nil {
      layout.image = CGRect(x: 0, y: 0, width: width, height: 134)
      y = 134
    }
    y += 10
    let inner = width - 24
    if !card.site.isEmpty {
      let site = box(plain(card.site.uppercased(), 12, theme.muted, lineHeight: 16, truncate: true), x: 12, y: y, maxWidth: inner, lineHeight: 16, maxLines: 1)
      layout.site = site
      y = site.frame.maxY + 2
    }
    if let title = card.title, !title.isEmpty {
      let text = box(plain(title, 15, theme.foreground, weight: .semibold, lineHeight: 20), x: 12, y: y, maxWidth: inner, lineHeight: 20, maxLines: 2)
      layout.title = text
      y = text.frame.maxY + 2
    }
    if let description = card.description, !description.isEmpty {
      let text = box(plain(description, 13, theme.muted, lineHeight: 18), x: 12, y: y, maxWidth: inner, lineHeight: 18, maxLines: 2)
      layout.description = text
      y = text.frame.maxY + 2
    }
    return (layout, y - 2 + 10)
  }

  /// The part a block reports for taps and holds.
  func partId(_ block: Block, message: MessageRow) -> String? {
    if case let .media(items, part) = block { return part ?? (items.count == 1 ? items[0].part : nil) }
    return block.part
  }

  /// The part the block's reactions belong to.
  func reactionPart(_ block: Block, message: MessageRow) -> String {
    if case let .media(items, part) = block { return items.count == 1 ? items[0].part : (part ?? items[0].part) }
    return block.part ?? "message"
  }

  // MARK: Stacked

  func stacked(_ message: MessageRow) -> MessageLayout {
    let pad = theme.horizontalPadding
    let avatar = theme.avatarSize
    let contentX = pad + avatar + 12
    let contentWidth = width - contentX - pad
    var layout = MessageLayout(height: 0)
    var y: CGFloat = 0

    // A reply's quote line goes above the row.
    var blocks = Array(message.blocks.enumerated())
    if let quoteIndex = blocks.firstIndex(where: { if case .quote = $0.element { return true } else { return false } }),
       case let .quote(author, text, _, messageId, _) = blocks[quoteIndex].element {
      let string = NSMutableAttributedString(attributedString: plain(author.name + " ", 13, theme.muted, weight: .semibold, lineHeight: 18, truncate: true))
      string.append(plain(text.replacingOccurrences(of: "\n", with: " "), 13, theme.muted, lineHeight: 18, truncate: true))
      let lineY: CGFloat = 16
      let faceX = pad + 17 + 22 + 4
      let textBox = box(string, x: faceX + 18 + 6, y: lineY, maxWidth: width - (faceX + 24) - pad, lineHeight: 18, maxLines: 1)
      let face = CGRect(x: faceX, y: lineY, width: 18, height: 18)
      let elbow = CGRect(x: pad + 17, y: lineY + 9, width: 22, height: 12 + 6)
      let frame = CGRect(x: 0, y: 0, width: width, height: lineY + 18)
      layout.parts.append(PartLayout(frame: frame, content: .quoteLine(face: face, person: author, text: textBox, elbow: elbow, messageId: messageId), part: nil, blockIndex: blocks[quoteIndex].offset))
      blocks.remove(at: quoteIndex)
      y = lineY + 18 + 6
    } else {
      y = message.startsGroup ? 20 : 6
    }

    if message.startsGroup && message.showAuthor {
      layout.avatar = (message.author, CGRect(x: pad, y: y, width: avatar, height: avatar))
      let name = box(plain(message.author.name, 15, theme.foreground, weight: .bold, lineHeight: 20, truncate: true), x: contentX, y: y, maxWidth: contentWidth * 0.7, lineHeight: 20, maxLines: 1)
      layout.name = name
      let time = box(plain(message.timeLabel, theme.caption.size, theme.muted, lineHeight: 20, truncate: true), x: name.frame.maxX + 8, y: y, maxWidth: contentWidth - name.frame.width - 8, lineHeight: 20, maxLines: 1)
      layout.headerTime = time
      y += 20 + 4
    }

    let edited = message.footer.first { $0.kind == .edited }
    let lastText = blocks.last { if case .text = $0.element { return true } else { return false } }?.offset
    var first = true
    for (index, block) in blocks {
      if !first { y += Metrics.partGap }
      first = false
      var frame: CGRect
      var content: PartContent
      var chipReactions: [Reaction] = []
      switch block {
      case let .text(spans, jumbo, _):
        let style = jumbo ? theme.jumbo : theme.body
        let string = NSMutableAttributedString(attributedString: spansString(spans, size: style.size, lineHeight: style.lineHeight, color: theme.foreground, mentionColor: theme.accent))
        if let edited, index == lastText {
          string.append(plain(" (\(edited.text.lowercased()))", theme.caption.size, theme.muted, lineHeight: style.lineHeight))
        }
        let text = box(string, x: 0, y: 0, maxWidth: contentWidth, lineHeight: style.lineHeight)
        frame = CGRect(x: contentX, y: y, width: text.frame.width, height: text.frame.height)
        content = .text(text, bubble: nil, spans: spans)
      case let .deleted(label, _):
        let text = box(plain(label, theme.body.size, theme.muted, lineHeight: theme.body.lineHeight, italic: true), x: 0, y: 0, maxWidth: contentWidth, lineHeight: theme.body.lineHeight)
        frame = CGRect(x: contentX, y: y, width: text.frame.width, height: text.frame.height)
        content = .text(text, bubble: nil, spans: [])
      case let .media(items, _):
        if items.count == 1 {
          let size = mediaSize(items[0], maxWidth: contentWidth)
          frame = CGRect(x: contentX, y: y, width: size.width, height: size.height)
          content = .media(items[0], radius: Metrics.mediaRadius)
          chipReactions = items[0].reactions
        } else {
          // The strip spans the row; cards start where its text does.
          var x: CGFloat = contentX
          var cards: [CGRect] = []
          var allChips: [ChipLayout] = []
          var chipsHeight: CGFloat = 0
          for item in items {
            let size = carouselCardSize(item)
            let card = CGRect(x: x, y: 0, width: size.width, height: size.height)
            cards.append(card)
            let placed = chips(item.reactions, part: item.part, origin: CGPoint(x: card.minX, y: card.maxY), width: card.width)
            allChips += placed.chips
            chipsHeight = max(chipsHeight, placed.height)
            x += size.width + Metrics.carouselGap
          }
          let contentWidth = x - Metrics.carouselGap + pad
          // Edge to edge: the strip runs from the screen's left edge to its
          // right, so cards scroll past the photo column.
          frame = CGRect(x: 0, y: y, width: width, height: Metrics.carouselHeight + chipsHeight)
          content = .carousel(CarouselLayout(items: items, cards: cards, chips: allChips, contentWidth: contentWidth, leadingInset: contentX))
          if let photo = layout.avatar?.frame, photo.maxY > frame.minY {
            // The photo shrinks from its top to clear the cards.
            layout.avatarRecede = max(0.4, (frame.minY - 2 - photo.minY) / photo.height)
          }
        }
      case let .file(name, sizeLabel, url, _):
        let cardWidth = min(Metrics.cardWidth, contentWidth)
        frame = CGRect(x: contentX, y: y, width: cardWidth, height: 64)
        let nameBox = box(plain(name, 15, theme.foreground, weight: .semibold, lineHeight: 20, truncate: true), x: 64, y: 12, maxWidth: cardWidth - 76, lineHeight: 20, maxLines: 1)
        let sizeBox = box(plain(sizeLabel, 13, theme.muted, lineHeight: 18, truncate: true), x: 64, y: 32, maxWidth: cardWidth - 76, lineHeight: 18, maxLines: 1)
        content = .file(name: nameBox, size: sizeBox, icon: CGRect(x: 12, y: 12, width: 40, height: 40), url: url)
      case let .linkCard(card):
        let cardWidth = min(Metrics.cardWidth, contentWidth)
        let measured = linkCard(card, width: cardWidth)
        frame = CGRect(x: contentX, y: y, width: cardWidth, height: measured.height)
        content = .linkCard(measured.layout)
      case .quote, .unknown:
        continue
      }
      layout.parts.append(PartLayout(frame: frame, content: content, part: partId(block, message: message), blockIndex: index))
      y = frame.maxY
      if !chipReactions.isEmpty {
        let placed = chips(chipReactions, part: reactionPart(block, message: message), origin: CGPoint(x: contentX, y: y), width: contentWidth)
        layout.chips += placed.chips
        y += placed.height
      }
    }

    for line in message.footer {
      switch line.kind {
      case .edited:
        continue
      case .notSent:
        layout.footer.append(notSent(line.text, y: y + 2, side: .left, left: contentX - 4, right: width - pad, maxWidth: contentWidth))
        y += 2 + theme.caption.lineHeight
      case .replies:
        let piece = replies(line, y: y + 6, side: .left, left: contentX, right: width - pad, maxWidth: contentWidth, pill: true)
        layout.footer.append(piece)
        y += 6 + 26
      }
    }
    if message.status == .failed, !message.footer.contains(where: { $0.kind == .notSent }) {
      layout.footer.append(notSent("Not sent", y: y + 2, side: .left, left: contentX - 4, right: width - pad, maxWidth: contentWidth))
      y += 2 + theme.caption.lineHeight
    }
    if !message.reactions.isEmpty {
      let placed = chips(message.reactions, part: reactionPartForMessage(message), origin: CGPoint(x: contentX, y: y), width: contentWidth)
      layout.chips += placed.chips
      y += placed.height
    }
    layout.height = ceil(y)
    layout.bounds = CGRect(x: pad, y: layout.avatar?.frame.minY ?? layout.parts.first?.frame.minY ?? 0, width: width - pad * 2, height: 0)
    layout.bounds.size.height = y - layout.bounds.minY
    return layout
  }

  func reactionPartForMessage(_ message: MessageRow) -> String {
    for block in message.blocks {
      if case let .text(_, _, part) = block { return part ?? "message" }
    }
    return message.blocks.first?.part ?? "message"
  }

  // MARK: Other rows

  func header(style: String, label: String) -> RowLayout {
    let string = NSMutableAttributedString(string: label, attributes: Fonts.attributes(
      Fonts.system(theme.caption.size), theme.muted, lineHeight: theme.caption.lineHeight, alignment: .center
    ))
    // "Today 9:41 AM": the day part is semibold; a day header is all bold.
    let semibold = Fonts.system(theme.caption.size, .semibold)
    if style == "day" {
      string.addAttribute(.font, value: semibold, range: NSRange(location: 0, length: string.length))
    } else if let range = label.range(of: #"\d{1,2}[:.]\d{2}"#, options: .regularExpression), range.lowerBound > label.startIndex {
      let prefix = NSRange(label.startIndex..<range.lowerBound, in: label)
      string.addAttribute(.font, value: semibold, range: prefix)
    }
    let size = measure(string, width: width - 64, lineHeight: theme.caption.lineHeight)
    let (top, bottom): (CGFloat, CGFloat) = style == "day" ? (12, 12) : (16, 6)
    let frame = CGRect(x: (width - size.width) / 2, y: top, width: size.width, height: size.height)
    return .header(TextBox(string: string, frame: frame), height: top + size.height + bottom, rules: .none)
  }

  /// A stacked day separator: a label between two fading rules.
  func stackedHeader(label: String) -> RowLayout {
    let string = plain(label, theme.caption.size, theme.muted, lineHeight: theme.caption.lineHeight, alignment: .center)
    let size = measure(string, width: width - 120, lineHeight: theme.caption.lineHeight)
    let frame = CGRect(x: (width - size.width) / 2, y: 28, width: size.width, height: size.height)
    return .header(TextBox(string: string, frame: frame), height: 28 + size.height + 8, rules: .day)
  }

  /// RepliesDivider.tsx: px-4, pt-5, pb-1, semibold footnote, gap-3.
  func repliesHeader(label: String) -> RowLayout {
    let string = plain(label, theme.footnote.size, theme.muted, weight: .semibold, lineHeight: theme.footnote.lineHeight)
    let size = measure(string, width: width - 32, lineHeight: theme.footnote.lineHeight)
    let frame = CGRect(x: 16, y: 20, width: size.width, height: size.height)
    return .header(TextBox(string: string, frame: frame), height: 20 + size.height + 4, rules: .replies)
  }

  func notice(_ spans: [Span]) -> RowLayout {
    let result = NSMutableAttributedString()
    for span in spans {
      let bold = span.style == .bold || span.style == .mention
      var text = span.text
      if bold && text.count > 40 { text = String(text.prefix(40)) + "…" }
      result.append(plain(text, theme.caption.size, theme.muted, weight: bold ? .semibold : .regular, lineHeight: theme.caption.lineHeight, alignment: .center))
    }
    let size = measure(result, width: width - 96, lineHeight: theme.caption.lineHeight)
    let frame = CGRect(x: (width - size.width) / 2, y: 12, width: size.width, height: size.height)
    return .notice(TextBox(string: result, frame: frame), height: 12 + size.height + 4)
  }

  /// `showFaces`: photos of who's typing, in groups and spaces
  /// (typing-parts.tsx). Without them a DM's bubble sits where its
  /// messages do, at the edge, and a stacked label at the text column.
  func typing(layout: MessageRow.Layout, people: [Person], label: String, showFaces: Bool = true) -> TypingLayout {
    let pad = theme.horizontalPadding
    if layout == .bubbles {
      let height: CGFloat = 14 + Metrics.typingBubble.height + Metrics.tailDrop
      let faced = showFaces ? people : []
      let shown = faced.count == 4 ? faced : Array(faced.prefix(3))
      let size = Metrics.bubbleAvatar
      var faces: [(Person, CGRect)] = []
      for (index, person) in shown.enumerated() {
        faces.append((person, CGRect(x: pad + CGFloat(index) * (size - 6), y: height - size, width: size, height: size)))
      }
      var x = pad + (faces.isEmpty ? 0 : CGFloat(faces.count - 1) * (size - 6) + size)
      var overflow: TextBox?
      if faced.count > 4 {
        let string = plain("+\(faced.count - 3)", 12, theme.muted, weight: .semibold, lineHeight: 16, alignment: .center)
        // Ringed like the faces and overlapping the last as they overlap
        // (`Faces`' more: marginLeft -overlap - ring, margin -ring), so
        // what follows starts a ring in from its outer edge. At least the
        // faces' size with its ring; 4 of padding each side, in the ring.
        let ring: CGFloat = 2
        let width = max(size + ring * 2, measure(string, width: 60, lineHeight: 16).width + 8 + ring * 2)
        overflow = TextBox(string: string, frame: CGRect(x: x - 6 - ring, y: height - size - ring, width: width, height: size + ring * 2))
        x += width - 6 - ring * 2
      }
      if !faced.isEmpty { x += Metrics.avatarGap }
      let bubble = CGRect(x: x, y: 14, width: Metrics.typingBubble.width, height: Metrics.typingBubble.height)
      let dots = (0..<3).map { index in
        CGRect(x: bubble.minX + (bubble.width - 32) / 2 + CGFloat(index) * 12, y: bubble.midY - 4, width: 8, height: 8)
      }
      return TypingLayout(height: height, faces: faces, faceRing: 2, bubble: bubble, label: nil, dots: dots, overflow: overflow)
    }
    let height: CGFloat = 10 + 20 + 2
    let size: CGFloat = 18
    let faced = showFaces ? people : []
    let shown = faced.count == 4 ? faced : Array(faced.prefix(3))
    var faces: [(Person, CGRect)] = []
    for (index, person) in shown.enumerated() {
      faces.append((person, CGRect(x: pad + CGFloat(index) * (size - 4), y: 11, width: size, height: size)))
    }
    // No faces: the label starts where a stacked message's text does.
    var x = faced.isEmpty ? pad + theme.avatarSize + 12 : pad + CGFloat(faces.count - 1) * (size - 4) + size + 8
    var overflow: TextBox?
    if faced.count > 4 {
      // How many more, on a chip in the bubble color that overlaps the
      // last face as the faces overlap (typing-parts.tsx `Faces`): at least
      // the faces' size, 4 of padding at each side, the ring around it.
      let ring: CGFloat = 1.5
      let string = plain("+\(faced.count - 3)", 10, theme.muted, weight: .semibold, lineHeight: 16, alignment: .center)
      let inner = CGRect(x: x - 8 - 4, y: 11, width: max(size, measure(string, width: 40, lineHeight: 16).width + 8), height: size)
      overflow = TextBox(string: string, frame: inner.insetBy(dx: -ring, dy: -ring))
      x = inner.maxX + 8
    }
    let text = box(plain(label, 13, theme.muted, lineHeight: 20, truncate: true), x: x, y: 10, maxWidth: width - x - pad - 22, lineHeight: 20, maxLines: 1)
    // 4-point dots 2 apart, 8 after the label (`gap-2`), centered on the line.
    let dots = (0..<3).map { index in
      CGRect(x: text.frame.maxX + 8 + CGFloat(index) * 6, y: 10 + 8, width: 4, height: 4)
    }
    return TypingLayout(height: height, faces: faces, faceRing: 1.5, bubble: nil, label: text, dots: dots, overflow: overflow)
  }
}

extension Reaction {
  init(key: String, emoji: String?, imageUrl: URL?, label: String, count: Int, mine: Bool) {
    self.key = key
    self.emoji = emoji
    self.imageUrl = imageUrl
    self.label = label
    self.count = count
    self.mine = mine
  }
}

extension NSAttributedString.Key {
  /// The index of the span a run of text came from (links and mentions).
  static let spanIndex = NSAttributedString.Key("veraSpanIndex")
}

extension MessageRow {
  /// Grows out of the typing bubble it replaces (typing-row.ts `morphs`):
  /// a bubble of text alone, with no media, quote, or link card.
  var morphsFromTyping: Bool {
    guard layout == .bubbles, !blocks.isEmpty else { return false }
    return blocks.allSatisfy { block in
      if case let .text(_, jumbo, _) = block { return !jumbo }
      return false
    }
  }
}

/// Where a card of a bubbles deck sits in its pile (DeckView), as plain
/// numbers so Tests/ checks them. The pile is three cards: the front one,
/// the next one behind it on the right, and the one before behind it on
/// the left, each turned and offset so a corner shows. A swipe left
/// brings the next card forward, a swipe right the one before; the front
/// card goes out with the finger and tucks in behind on that side. The
/// two undo each other. Android draws the same pile.
struct DeckPose: Equatable {
  var x: CGFloat = 0
  var y: CGFloat = 0
  /// Radians, clockwise, about the card's bottom center.
  var angle: CGFloat = 0
  var scale: CGFloat = 1
  var alpha: CGFloat = 1
  /// 0 in front, 1 behind: how blurred and dimmed it is.
  var depth: CGFloat = 0
}

enum DeckPile {
  enum Side { case left, right }
  enum Role: Equatable {
    case front
    case behind(Side)
    /// Further down the pile, hidden, on the side it will come from or
    /// went to.
    case hidden(Side)
  }

  static let front = DeckPose()
  static func behind(_ side: Side) -> DeckPose {
    let sign: CGFloat = side == .right ? 1 : -1
    return DeckPose(x: 4 * sign, y: -10, angle: sign * 3 * .pi / 180, scale: 0.96, depth: 1)
  }
  static func hidden(_ side: Side) -> DeckPose {
    var pose = behind(side)
    pose.alpha = 0
    return pose
  }
  static func pose(_ role: Role) -> DeckPose {
    switch role {
    case .front: return front
    case let .behind(side): return behind(side)
    case let .hidden(side): return hidden(side)
    }
  }

  /// The drag that brings a card behind fully forward, as a share of the
  /// card's width.
  static let reveal: CGFloat = 0.6
  /// Where a thrown card goes, beside the pile, before it tucks in: just
  /// past the card's width, so it changes sides with nothing overlapping.
  static func out(width: CGFloat) -> CGFloat { width + 12 }

  /// How long a thrown card takes to get beside the pile: about 120 ms,
  /// sooner when the finger was faster than that would carry it (the move
  /// eases out, so it starts at about twice its average speed), never
  /// under 70. Then it takes `tuckIn` to go in behind. Android's are the
  /// same.
  static func throwOut(distance: CGFloat, speed: CGFloat) -> Double {
    let base = 0.12
    guard distance > 0, speed > 0 else { return base }
    return min(base, max(0.07, Double(2 * distance / speed)))
  }
  static let tuckIn = 0.16

  /// What `item` is in a pile of `count` with `front` in front. With two,
  /// the card behind is on `lone`'s side: where the last card went.
  static func role(of item: Int, front: Int, count: Int, lone: Side = .right) -> Role {
    let depth = ((item - front) % count + count) % count
    if depth == 0 { return .front }
    if count == 2 { return .behind(lone) }
    if depth == 1 { return .behind(.right) }
    if depth == count - 1 { return .behind(.left) }
    return .hidden(depth <= count / 2 ? .right : .left)
  }

  /// The front card after a swipe: left brings the next, right the one
  /// before.
  static func front(after front: Int, forward: Bool, count: Int) -> Int {
    guard count > 0 else { return 0 }
    return ((front + (forward ? 1 : -1)) % count + count) % count
  }

  /// The cards drawn: the front, the two behind it, and the two that come
  /// into view next (so they're there before a swipe ends).
  static func shown(front: Int, count: Int) -> [Int] {
    guard count > 0 else { return [] }
    var items: [Int] = []
    for step in [0, 1, count - 1, 2, count - 2] where step >= 0 && step < count {
      let item = (front + step) % count
      if !items.contains(item) { items.append(item) }
    }
    return items
  }

  static func mix(_ a: DeckPose, _ b: DeckPose, _ t: CGFloat) -> DeckPose {
    func lerp(_ x: CGFloat, _ y: CGFloat) -> CGFloat { x + (y - x) * t }
    return DeckPose(x: lerp(a.x, b.x), y: lerp(a.y, b.y), angle: lerp(a.angle, b.angle), scale: lerp(a.scale, b.scale),
                    alpha: lerp(a.alpha, b.alpha), depth: lerp(a.depth, b.depth))
  }
}

extension MessageLayout {
  /// How far the author's photo has shrunk (`avatarRecede`) with the
  /// carousel scrolled `offset` in: from full size at rest to the recede
  /// scale over the photo's size plus 12 of scrolling, on CSS `ease`, as
  /// Android does. 1 when it doesn't recede.
  func avatarScale(carouselOffset offset: CGFloat) -> CGFloat {
    guard let recede = avatarRecede, let photo = avatar?.frame, photo.height > 0 else { return 1 }
    let t = min(1, max(0, offset / (photo.height + 12)))
    return 1 - (1 - recede) * Ease.css(t)
  }
}

enum Ease {
  /// CSS `ease`, cubic-bezier(0.25, 0.1, 0.25, 1): the list's curve.
  static func css(_ x: CGFloat) -> CGFloat {
    if x <= 0 { return 0 }
    if x >= 1 { return 1 }
    // Solve the curve's x(t) = x by bisection, then return y(t).
    func bezier(_ t: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat {
      3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
    }
    var low: CGFloat = 0, high: CGFloat = 1
    for _ in 0..<24 {
      let mid = (low + high) / 2
      if bezier(mid, 0.25, 0.25) < x { low = mid } else { high = mid }
    }
    return bezier((low + high) / 2, 0.1, 1)
  }
}
