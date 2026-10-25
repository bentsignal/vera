import UIKit

// Native tests for the message list: heights from data, older pages
// keeping the reader's place, and batch updates matching the data's diff.
// Run with Tests/run.sh (it builds this with Models, Theme, Measure,
// ListLayout, and ListDiff for Mac Catalyst and runs it on the Mac).

var failures = 0
var checks = 0

func check(_ condition: @autoclosure () -> Bool, _ what: String, line: Int = #line) {
  checks += 1
  if !condition() {
    failures += 1
    print("FAIL line \(line): \(what)")
  }
}

func equal<T: Equatable>(_ actual: T, _ expected: T, _ what: String, line: Int = #line) {
  check(actual == expected, "\(what): \(actual) != \(expected)", line: line)
}

// MARK: Rows from JSON, as JavaScript sends them

func person(_ id: String) -> JSON {
  ["id": id, "name": id.capitalized, "avatarUrl": NSNull(), "initials": String(id.prefix(1))]
}

func message(
  _ id: String, text: String = "Hello", layout: String = "bubbles", own: Bool = false,
  showAuthor: Bool = false, starts: Bool = true, ends: Bool = true, arrived: Bool = false,
  blocks: [JSON]? = nil, reactions: [JSON] = []
) -> JSON {
  [
    "id": id, "kind": "message", "layout": layout, "author": person(own ? "me" : "maya"), "isOwn": own,
    "showAuthor": showAuthor, "startsGroup": starts, "endsGroup": ends, "sentAt": 0, "timeLabel": "9:41 AM",
    "blocks": blocks ?? [["type": "text", "part": "message", "spans": [["text": text]]]],
    "reactions": reactions, "footer": [JSON](), "arrived": arrived, "accessibilityLabel": text,
  ]
}

func photo(_ width: Double, _ height: Double) -> JSON {
  ["type": "media", "items": [["id": "p", "kind": "image", "url": "https://example.com/p.jpg", "width": width, "height": height, "part": "attachment:p", "reactions": [JSON]()]]]
}

let theme = Theme()
let width: CGFloat = 390
let measurer = Measurer(theme: theme, width: width)

func height(_ json: JSON) -> CGFloat {
  measurer.layout(Row(json)).height
}

// MARK: Heights from data (the React Native list's numbers)

// A one-line bubble is 38 tall; a run's first row has 14 above it, the
// rest 4; the last of a run has its 7-point tail below.
equal(height(message("a")), 14 + 38 + 7, "one line, starts and ends a run")
equal(height(message("a", starts: false)), 4 + 38 + 7, "one line, inside a run")
equal(height(message("a", starts: false, ends: false)), 4 + 38, "one line, no tail")
// The sender's name over a group's first message: 16 and a gap of 6.
equal(height(message("a", showAuthor: true)), 14 + 22 + 38 + 7, "with the sender's name")
// Each wrapped line adds 22.
let long = String(repeating: "word ", count: 40)
let longHeight = height(message("a", text: long, ends: false)) - 14 - 16
check(longHeight > 22 && longHeight.truncatingRemainder(dividingBy: 22) == 0, "wrapped lines are 22 each (\(longHeight))")
// Tapbacks open 25 above the bubble.
let thumbs: JSON = ["key": "👍", "content": ["emoji": "👍"], "count": 1, "mine": false]
equal(height(message("a", reactions: [thumbs])), 14 + 25 + 38 + 7, "with a tapback")
// A photo is 240 wide, its height from its size, at most 300; no tail.
equal(height(message("a", blocks: [photo(1200, 900)])), 14 + 180, "a landscape photo")
equal(height(message("a", blocks: [photo(900, 2000)])), 14 + 300, "a tall photo, capped")
// Stacked: 20 above a run, the 20-point name line and 4, then the text.
equal(height(message("a", layout: "stacked", showAuthor: true)), 20 + 24 + 22, "a stacked run's first message")
equal(height(message("a", layout: "stacked", starts: false)), 6 + 22, "a stacked message inside a run")
// The typing indicator, and a time header.
equal(measurer.layout(Row(["id": "t", "kind": "typing", "layout": "bubbles", "people": [person("maya")], "label": ""])).height, 59, "typing, bubbles")
equal(measurer.layout(Row(["id": "t", "kind": "typing", "layout": "stacked", "people": [person("maya")], "label": "Maya is typing"])).height, 32, "typing, stacked")
equal(measurer.layout(Row(["id": "h", "kind": "header", "style": "time", "label": "Today 9:41 AM"])).height, 38, "a time header")
if case let .header(box, height, rules) = measurer.layout(Row(["id": "r", "kind": "header", "style": "replies", "label": "No replies yet"])) {
  equal(box.frame.origin, CGPoint(x: 16, y: 20), "replies divider starts at the RN label's inset")
  equal(height, 20 + theme.footnote.lineHeight + 4, "replies divider uses footnote height and RN padding")
  equal(rules, .replies, "replies divider has only a trailing hairline")
} else { check(false, "replies divider is a header") }
if case let .header(_, _, rules) = measurer.layout(Row(["id": "h", "kind": "header", "style": "future", "label": "Future header"])) {
  equal(rules, .day, "an unknown header style falls back to day")
}

// A bubble never passes three quarters of the row.
if case let .message(layout) = measurer.layout(Row(message("a", text: long))) {
  check(layout.parts[0].frame.width <= floor((width - 32) * 0.75), "a bubble stays within its max width")
  check(layout.parts[0].frame.maxX <= width, "a bubble stays on screen")
}
// Your own bubbles sit on the right.
if case let .message(layout) = measurer.layout(Row(message("a", own: true))) {
  equal(layout.parts[0].frame.maxX, width - 16, "your bubble's right edge")
}

// MARK: Decoding never crashes, and draws what it can't as fallback text

let strange: [JSON] = [
  ["id": "x", "kind": "poll", "fallbackText": "A poll"],
  ["id": "y"],
  ["id": "z", "kind": "message", "blocks": [["type": "chart"]], "fallbackText": "A chart"],
  ["id": "w", "kind": "message", "reactions": [["key": "x", "count": Double.infinity]], "blocks": [JSON]()],
  ["kind": "header"],
]
for json in strange { _ = height(json) }
if case let .fallback(text) = Row(strange[0]).content { equal(text, "A poll", "an unknown kind draws its fallback text") } else { check(false, "an unknown kind is a fallback") }
if case let .message(row) = Row(strange[2]).content, case let .text(spans, _, _) = row.blocks.first {
  equal(spans.first?.text, "A chart", "a message with an unknown block draws its fallback text")
} else { check(false, "a message with an unknown block is drawn as text") }
equal(Behavior(["firehoseFrom": Double.infinity]).firehoseFrom, 1_000_000, "an infinite firehose threshold means never")
equal(Behavior(["moveMs": Double.infinity]).moveMs, 5000, "an animation can't last forever")
_ = Row(message("v", blocks: [["type": "media", "items": [["id": "v", "kind": "video", "url": "u", "width": 1, "height": 1, "part": "p", "durationSeconds": Double.infinity, "reactions": [JSON]()]]]]))
_ = LiftRequest(["rowId": "a", "index": Double.infinity, "shift": Double.nan, "scale": 1, "origin": "start"])

// MARK: Older pages keep the reader's place

let layout = ListLayout()
func ids(_ range: Range<Int>) -> [String] { range.map { "m\($0)" } }
let heights = (0..<60).map { CGFloat(40 + ($0 * 37) % 200) }
layout.update(ids: ids(0..<60), heights: heights)
let before = layout.frame(of: "m30")!
// An older page goes past the top (the end): nothing on screen moves.
layout.update(ids: ids(0..<110), heights: heights + (0..<50).map { CGFloat(50 + $0) })
equal(layout.frame(of: "m30")!.minY, before.minY, "a row keeps its place when an older page loads")
equal(layout.oldFrame(of: "m30")!.minY, before.minY, "and its old frame is where it was")
// Arrivals at the bottom (the start) move it by exactly their height, which
// is what the list scrolls by to keep it still when you're scrolled up.
let arrivalHeights: [CGFloat] = [59, 49]
layout.update(ids: ["new2", "new1"] + ids(0..<110), heights: arrivalHeights + heights + (0..<50).map { CGFloat(50 + $0) })
equal(layout.frame(of: "m30")!.minY - before.minY, arrivalHeights.reduce(0, +), "arrivals move rows by their height")
// Frames are contiguous: each row starts where the one below it ends.
var contiguous = true
for index in 1..<layout.ids.count where layout.frame(at: index).minY != layout.frame(at: index - 1).maxY { contiguous = false }
check(contiguous, "rows stack with no gaps or overlaps")

// MARK: Batch updates match the data's diff

func rows(_ ids: [String], arrived: Set<String> = [], typing: Bool = false) -> [Row] {
  (typing ? [Row(["id": "typing", "kind": "typing", "layout": "bubbles", "people": [person("maya")], "label": ""])] : [])
    + ids.map { Row(message($0, arrived: arrived.contains($0))) }
}

var generator = SystemRandomNumberGenerator()
var mismatches = 0
for round in 0..<500 {
  var old = ids(0..<Int.random(in: 0..<40, using: &generator))
  if round % 7 == 0 { old.shuffle(using: &generator) }
  var new = old
  // Some removed, some older added past the end, some arrivals at the start.
  new.removeAll { _ in Int.random(in: 0..<10, using: &generator) == 0 }
  new += (0..<Int.random(in: 0..<5, using: &generator)).map { "older\(round)-\($0)" }
  let arrivals = (0..<Int.random(in: 0..<4, using: &generator)).map { "new\(round)-\($0)" }
  new = arrivals + new
  let oldRows = rows(old)
  let newRows = rows(new, arrived: Set(arrivals))
  let diff = ListDiff(old: oldRows, oldHeights: oldRows.map { _ in 40 }, new: newRows, newHeights: newRows.map { _ in 40 })
  if diff.applied(to: old, new: new) != new { mismatches += 1 }
  if diff.arrived.map({ new[$0] }) != arrivals { mismatches += 1 }
}
equal(mismatches, 0, "500 random updates: deletes and inserts give the new list, arrivals found")

// Arrivals above the typing indicator still count as arrivals.
let withTyping = ListDiff(
  old: rows(["a", "b"], typing: true), oldHeights: [59, 40, 40],
  new: rows(["c", "a", "b"], arrived: ["c"], typing: true), newHeights: [59, 40, 40, 40]
)
equal(withTyping.arrived, [1], "an arrival while someone types")
// A row that changes kind under the same ID reloads; a changed one updates.
let kindChange = ListDiff(
  old: [Row(message("a")), Row(message("b"))], oldHeights: [40, 40],
  new: [Row(["id": "a", "kind": "notice", "spans": [["text": "Gone"]]]), Row(message("b", text: "Edited"))], newHeights: [40, 40]
)
equal(kindChange.reloaded, [0], "a kind change reloads")
equal(kindChange.changed, ["b"], "a content change updates in place")
check(ListDiff(old: rows(["a"]), oldHeights: [40], new: rows(["a"]), newHeights: [40]).isEmpty, "nothing changed, nothing to do")

// MARK: Phone feedback, 2026-10-23 evening

func reaction(_ key: String, count: Int = 1, mine: Bool = false) -> JSON {
  ["key": key, "content": ["emoji": String(key.split(separator: " ").last ?? "")], "count": count, "mine": mine]
}
func item(_ id: String, reactions: [JSON] = [], width: Double = 1200, height: Double = 900) -> JSON {
  ["id": id, "kind": "image", "url": "https://example.com/\(id).jpg", "width": width, "height": height, "part": id, "reactions": reactions]
}
func media(_ items: [JSON]) -> JSON { ["type": "media", "items": items] }
func messageLayout(_ json: JSON) -> MessageLayout? {
  if case let .message(layout) = measurer.layout(Row(json)) { return layout }
  return nil
}

// A tapped chip, drawn toggled before JavaScript's rows say so.
let chipRow = message("c", layout: "stacked", reactions: [reaction("message 👍", count: 2), reaction("message 🎉", mine: true)])
equal(ReactionToggle.mine(chipRow, key: "message 🎉"), true, "a reaction's mine, read from the row")
equal(ReactionToggle.mine(chipRow, key: "message 😮"), nil, "a reaction the row doesn't have")
let added = ReactionToggle.setting(chipRow, key: "message 👍", mine: true)
equal(added.objects("reactions")[0].int("count", 0), 3, "yours added: one more")
equal(added.objects("reactions")[0].bool("mine"), true, "yours added: tinted")
let takenBack = ReactionToggle.setting(chipRow, key: "message 🎉", mine: false)
equal(takenBack.objects("reactions").map { $0.str("key") }, ["message 👍"], "yours taken back from a count of one: gone")
equal(ReactionToggle.setting(added, key: "message 👍", mine: true).objects("reactions")[0].int("count", 0), 3,
      "already yours: unchanged, so a repeated toggle can't count twice")
let photoRow = message("p", layout: "stacked", blocks: [media([item("0", reactions: [reaction("0 👍")]), item("1", reactions: [reaction("1 👍")])])])
let photoToggled = ReactionToggle.setting(photoRow, key: "1 👍", mine: true)
let toggledItems = photoToggled.objects("blocks")[0].objects("items")
equal(toggledItems.map { $0.objects("reactions")[0].int("count", 0) }, [1, 2], "only the tapped photo's reaction changes")

// Taps and holds find the chip under the finger.
if let layout = messageLayout(chipRow), let chip = layout.chips.first {
  equal(layout.reaction(at: CGPoint(x: chip.frame.midX, y: chip.frame.midY))?.key, "message 👍", "a stacked chip is hit")
  equal(layout.reaction(at: CGPoint(x: chip.frame.midX, y: chip.frame.midY))?.kind, .chip, "as a chip")
  check(layout.reaction(at: CGPoint(x: chip.frame.midX, y: chip.frame.minY - 20)) == nil, "the text above a chip isn't")
} else { check(false, "a stacked row with chips") }
if let layout = messageLayout(message("t", reactions: [reaction("message 👍")])), let tapback = layout.tapbacks.first {
  let hit = layout.reaction(at: CGPoint(x: tapback.frame.midX, y: tapback.frame.midY))
  equal(hit?.kind, .tapback, "a bubble's tapback is hit")
  equal(hit?.part, "message", "with its part")
} else { check(false, "a bubble with a tapback") }

// A deck's tapbacks are each card's own, shown on it in front.
let deckRow = message("d", blocks: [media([item("0"), item("1", reactions: [reaction("1 ❤️")]), item("2")])])
if let layout = messageLayout(deckRow), case let .deck(deck) = layout.parts.first?.content {
  check(layout.tapbacks.isEmpty, "a deck's tapbacks aren't the message's")
  equal(deck.tapbacks.map(\.count), [0, 1, 0], "each card has its own")
  equal(deck.tapbacks[1].first?.reaction.key, "1 ❤️", "the second card's reaction, not merged")
  equal(deck.tapbacks[1].first?.part, "1", "on the second card's part")
  let spot = deck.tapbacks[1][0].frame
  check(deck.tapback(at: CGPoint(x: spot.midX, y: spot.midY), front: 0) == nil, "not hit while another card is in front")
  equal(deck.tapback(at: CGPoint(x: spot.midX, y: spot.midY), front: 1)?.reaction.key, "1 ❤️", "hit with its card in front")
  equal(height(deckRow), height(message("d", blocks: [media([item("0", reactions: [reaction("0 ❤️")]), item("1"), item("2")])])),
        "room for the tapbacks whichever card has them")
} else { check(false, "several photos in bubbles are a deck") }

// A reaction's taps and holds report the exact item it's on.
if let layout = messageLayout(deckRow) {
  check(layout.target(forPart: "1").map { $0.at == 0 && $0.index == 1 } == true, "a deck card's reaction: the deck, its item")
}
if let layout = messageLayout(photoRow) {
  check(layout.target(forPart: "1").map { $0.index == 1 } == true, "a carousel item's chip: its item")
  check(layout.target(forPart: "0").map { $0.index == 0 } == true, "the first item's: the first")
}
let captioned = message("q", layout: "stacked", blocks: [
  ["type": "text", "part": "message", "spans": [["text": "Look"]]], media([item("1"), item("2")]),
], reactions: [reaction("message 👍")])
if let layout = messageLayout(captioned) {
  check(layout.target(forPart: "message").map { $0.at == 0 && $0.index == nil } == true, "the caption's reaction: the caption, not a photo")
  check(layout.target(forPart: "2").map { $0.at == 1 && $0.index == 1 } == true, "a photo's under a caption: that photo")
}

// Message chips belong directly below stacked body text, before its photo.
let bodyAndPhoto = message("body-photo", layout: "stacked", blocks: [
  ["type": "text", "part": "message", "spans": [["text": "Testing"]]],
  media([item("photo", reactions: [reaction("photo ❤️")])]),
], reactions: [reaction("message 👍"), reaction("message 👎")])
if let layout = messageLayout(bodyAndPhoto), layout.parts.count == 2 {
  let body = layout.parts[0].frame
  let photo = layout.parts[1].frame
  let bodyChips = layout.chips.filter { $0.part == "message" }
  equal(bodyChips.count, 2, "both body reactions appear once")
  for chip in bodyChips {
    equal(chip.frame.minY, body.maxY + 4, "body chip keeps the existing4pt gap under body text")
    check(chip.frame.maxY <= photo.minY, "body chip ends before media begins")
    let hit = layout.reaction(at: CGPoint(x: chip.frame.midX, y: chip.frame.midY))
    equal(hit?.key, chip.reaction.key, "body chip hit retains its own key")
    equal(hit?.part, "message", "body chip hit targets message, not photo")
    check(hit.flatMap { layout.target(forPart: $0.part) }.map { $0.at == 0 && $0.index == nil } == true,
          "body chip routes to text part")
  }
  if let photoChip = layout.chips.first(where: { $0.part == "photo" }) {
    equal(photoChip.frame.minY, photo.maxY + 4, "photo heart keeps the existing4pt gap under photo")
    let hit = layout.reaction(at: CGPoint(x: photoChip.frame.midX, y: photoChip.frame.midY))
    equal(hit?.key, "photo ❤️", "photo heart retains its item reaction")
    check(hit.flatMap { layout.target(forPart: $0.part) }.map { $0.at == 1 && $0.index == 0 } == true,
          "photo heart still routes to exact media item")
  } else { check(false, "mixed row retains photo heart") }
} else { check(false, "stacked body and photo layout") }
if let layout = messageLayout(message("photo-no-body", layout: "stacked", blocks: [
  media([item("photo", reactions: [reaction("photo ❤️")])]),
], reactions: [reaction("message 👍")])),
   let photoChip = layout.chips.first(where: { $0.part == "photo" }),
   let messageChip = layout.chips.first(where: { $0.part == "message" }) {
  equal(photoChip.frame.minY, layout.parts[0].frame.maxY + 4, "without text, photo chips keep their placement")
  equal(messageChip.frame.minY, photoChip.frame.maxY + 4, "without text, message chips retain existing trailing placement")
} else { check(false, "photo-only message retains both chip groups") }

// Holding a carousel card lifts that card alone, framed where it's drawn.
let strip4 = message("s", layout: "stacked", blocks: [
  ["type": "text", "part": "message", "spans": [["text": "Trip"]]],
  media((0..<4).map { item("\($0 + 1)", width: 900, height: 1200) }),
])
if let layout = messageLayout(strip4), case let .carousel(strip) = layout.parts[1].content {
  let partFrame = layout.parts[1].frame
  equal(layout.liftedPart("3"), 1, "a card's part lifts from the carousel, not the caption")
  equal(layout.liftedPart("message"), 0, "the caption's part lifts the caption")
  equal(layout.liftedPart("9"), nil, "a part the message doesn't have lifts nothing, not the caption")
  equal(layout.liftedPart(nil), 0, "no part: the first, as before")
  // Composed, as liftPieces resolves a lift: the part, then the card.
  func lifted(_ part: String?, _ index: Int?) -> Int? {
    guard let at = layout.liftedPart(part, index: index) else { return nil }
    guard case let .carousel(cards) = layout.parts[at].content else { return -1 }
    return cards.liftedItem(part: part, index: index, blockPart: layout.parts[at].part)
  }
  equal(lifted("3", 2), 2, "the held third card")
  equal(lifted("3", 0), 2, "a stale index: still the third card")
  equal(lifted(nil, 2), 2, "only an index: that card, not the caption")
  equal(lifted(nil, 9), nil, "an index no card has: nothing, not the caption")
  equal(lifted("9", 2), nil, "an unknown part: nothing, not the caption or another card")
  equal(lifted("message", nil), -1, "the caption's own hold still lifts the caption")
  equal(lifted(nil, nil), -1, "no part or index: the first part, as before")
  equal(strip.liftedItem(part: "3", index: 2, blockPart: nil), 2, "the reported index, when it's that card")
  equal(strip.liftedItem(part: "3", index: 0, blockPart: nil), 2, "a stale index: the card whose part it is")
  equal(strip.liftedItem(part: "3", index: 9, blockPart: nil), 2, "an index past the end: the card whose part it is")
  equal(strip.liftedItem(part: "9", index: 9, blockPart: nil), nil, "neither: no card")
  equal(strip.liftedItem(part: nil, index: 1, blockPart: nil), 1, "only an index: that card")
  let maxOffset = strip.contentWidth - width
  for offset in [0, maxOffset] {
    let frame = strip.cardFrame(2, offset: offset, in: partFrame)
    equal(frame?.minX, strip.cards[2].minX - offset, "the third card where it's drawn, scrolled \(offset)")
    equal(frame?.minY, partFrame.minY, "at the strip's top")
    equal(frame?.size, strip.cards[2].size, "its own size, not the strip's")
  }
  check(strip.cardFrame(2, offset: maxOffset, in: partFrame).map { $0.maxX <= width - theme.horizontalPadding + 0.5 } == true,
        "at the last offset the third card is on screen")
  equal(strip.cardFrame(7, offset: 0, in: partFrame), nil, "no card, no frame")
} else { check(false, "a captioned stacked carousel") }

// The deck's pile: the next behind on the right, the one before on the
// left; swipes either way undo each other.
equal(DeckPile.front(after: 0, forward: true, count: 4), 1, "left: the next card")
equal(DeckPile.front(after: 0, forward: false, count: 4), 3, "right: the one before")
equal(DeckPile.front(after: DeckPile.front(after: 2, forward: true, count: 5), forward: false, count: 5), 2, "left then right: back where it was")
equal(DeckPile.role(of: 1, front: 0, count: 5), .behind(.right), "the next card is behind on the right")
equal(DeckPile.role(of: 4, front: 0, count: 5), .behind(.left), "the one before, on the left")
equal(DeckPile.role(of: 2, front: 0, count: 5), .hidden(.right), "further down, hidden on the side it comes from")
// A swipe left: the old front is now the one before, on the left, where it tucked in.
equal(DeckPile.role(of: 0, front: DeckPile.front(after: 0, forward: true, count: 5), count: 5), .behind(.left), "thrown left, it's behind on the left")
equal(DeckPile.role(of: 0, front: 1, count: 2, lone: .left), .behind(.left), "two cards: the one behind is where the last went")
equal(DeckPile.shown(front: 0, count: 5), [0, 1, 4, 2, 3], "the pile and the two that come next are drawn")
equal(DeckPile.shown(front: 1, count: 2), [1, 0], "two cards: both, once")
check(DeckPile.behind(.right).angle > 0 && DeckPile.behind(.left).angle < 0, "the cards behind turn either way")
check(DeckPile.behind(.right).x > 0 && DeckPile.behind(.left).x < 0, "and are offset to their sides")
equal(DeckPile.mix(DeckPile.behind(.right), DeckPile.front, 0.5).depth, 0.5, "halfway forward, half blurred")
equal(DeckPile.hidden(.left).alpha, 0, "hidden cards don't show")
check(DeckPile.out(width: 220) > 220, "a thrown card clears the pile before it goes behind")

// The stacked carousel spans the row and settles where a fling would stop.
let carouselRow = message("k", layout: "stacked", showAuthor: true,
                          blocks: [media((0..<5).map { item("\($0)", width: 900, height: 1200) })])
if let layout = messageLayout(carouselRow), case let .carousel(strip) = layout.parts.first?.content, let frame = layout.parts.first?.frame {
  let contentX = theme.horizontalPadding + theme.avatarSize + 12
  equal(frame.minX, 0, "edge to edge: from the screen's left")
  equal(frame.width, width, "to its right")
  equal(strip.cards[0].minX, contentX, "the first card starts where the text does")
  equal(strip.offset(of: 2), strip.cards[2].minX - contentX, "a card settles at the text's start")
  let maxOffset = strip.contentWidth - width
  equal(strip.settle(projected: strip.offset(of: 3) + 10, current: 0, velocity: 2, maxOffset: maxOffset), min(strip.offset(of: 3), maxOffset),
        "a hard fling travels several cards")
  equal(strip.settle(projected: 60, current: 40, velocity: 0.3, maxOffset: maxOffset), strip.offset(of: 1), "a slow swipe forward moves one")
  equal(strip.settle(projected: 10_000, current: 0, velocity: 5, maxOffset: maxOffset), maxOffset, "the last card settles fully on screen")
  equal(strip.settle(projected: strip.offset(of: 2) - 40, current: strip.offset(of: 2) - 30, velocity: -0.3, maxOffset: maxOffset),
        strip.offset(of: 1), "back is never ahead")
  if let recede = layout.avatarRecede, let photo = layout.avatar?.frame {
    check(photo.minY + photo.height * recede <= frame.minY, "the photo shrinks clear of the cards")
    equal(layout.avatarScale(carouselOffset: 0), 1, "at rest the photo is full size")
    equal(layout.avatarScale(carouselOffset: photo.height + 12), recede, "scrolled past it, it's cleared the cards")
    check(layout.avatarScale(carouselOffset: 10) > layout.avatarScale(carouselOffset: 20), "it shrinks as they pass")
  } else { check(false, "the photo beside a carousel recedes") }
  check(abs(Ease.css(0.5) - 0.8024) < 0.001, "CSS ease at half way")
} else { check(false, "several photos in a stacked row are a carousel") }

// Typing faces: groups and spaces, not one-on-one.
func typing(_ layout: String, showFaces: Bool?) -> TypingLayout? {
  var json: JSON = ["id": "t", "kind": "typing", "layout": layout, "people": [person("maya")], "label": "Maya is typing"]
  if let showFaces { json["showFaces"] = showFaces }
  if case let .typing(typing) = measurer.layout(Row(json)) { return typing }
  return nil
}
equal(typing("bubbles", showFaces: false)?.faces.count, 0, "a DM's typing bubble has no photo")
equal(typing("bubbles", showFaces: false)?.bubble?.minX, theme.horizontalPadding, "and sits where a DM's message does")
equal(typing("bubbles", showFaces: true)?.faces.count, 1, "a group's has")
equal(typing("bubbles", showFaces: nil)?.faces.count, 1, "older JavaScript: faces, as before")
equal(typing("stacked", showFaces: false)?.faces.count, 0, "a stacked DM's line has no photo")
equal(typing("stacked", showFaces: false)?.label?.frame.minX, theme.horizontalPadding + theme.avatarSize + 12, "its label starts at the text column")

// Only a bubble of text grows out of the typing bubble (typing-row.ts).
check(Row(message("g")).message?.morphsFromTyping == true, "text grows out of the typing bubble")
check(Row(message("g", blocks: [photo(10, 10)])).message?.morphsFromTyping == false, "a photo doesn't")
check(Row(message("g", layout: "stacked")).message?.morphsFromTyping == false, "nor a stacked row")

// MARK: Phone feedback round 2, 2026-10-24

// Deck cards of different shapes are centered in the tallest one's height,
// so the pile keeps its height and its middle whichever card is in front.
let mixedDeck = message("m", blocks: [media([
  item("0", width: 1200, height: 900), item("1", width: 900, height: 1600), item("2", width: 1000, height: 1000),
  item("3", reactions: [reaction("3 ❤️")], width: 800, height: 1600),
])])
if let layout = messageLayout(mixedDeck), case let .deck(deck) = layout.parts.first?.content {
  let middles = deck.items.indices.map { deck.cardFrame($0).midY }
  check(middles.allSatisfy { abs($0 - middles[0]) <= 0.5 }, "every card's middle is the pile's: \(middles)")
  check(deck.items.indices.allSatisfy { deck.cardFrame($0).minY >= deck.cardTop - 0.5 && deck.cardFrame($0).maxY <= deck.cardTop + deck.tallest + 0.5 },
        "every card inside the tallest's height")
  equal(deck.tallest, deck.sizes.map { $0.height }.max() ?? 0, "the tallest of all the cards, not just the front three")
  // The fourth card is the tallest here; the row is as tall with any in front.
  if let tapback = deck.tapbacks[3].first {
    check(abs(tapback.frame.minY - (deck.cardFrame(3).minY - Metrics.tapbackSpace)) < 0.5, "a card's tapbacks sit over its own top corner")
  } else { check(false, "the fourth card's tapback") }
  check(deck.cardFrame(9) == .zero, "no card, no frame")
} else { check(false, "a deck of mixed shapes") }

// A thrown card's trip: about 120 ms out, sooner the faster the finger,
// never under 70, then 160 ms in behind.
equal(DeckPile.throwOut(distance: 200, speed: 0), 0.12, "no fling: 120 ms out")
check(DeckPile.throwOut(distance: 200, speed: 3000) <= DeckPile.throwOut(distance: 200, speed: 1500), "faster finger, quicker throw")
equal(DeckPile.throwOut(distance: 200, speed: 100_000), 0.07, "never under 70 ms")
check(DeckPile.throwOut(distance: 200, speed: 500) <= 0.12, "a slow fling is never slower than a release")
equal(DeckPile.tuckIn, 0.16, "160 ms in behind")

// Stacked typing: photos at their own size inside the ring, the count chip
// overlapping the last face, the dots centered on the line.
func typingPeople(_ count: Int, _ layout: String) -> TypingLayout? {
  let json: JSON = ["id": "t", "kind": "typing", "layout": layout, "people": (0..<count).map { person("p\($0)") }, "label": "People are typing"]
  if case let .typing(typing) = measurer.layout(Row(json)) { return typing }
  return nil
}
if let line = typingPeople(5, "stacked"), let chip = line.overflow, let label = line.label, let last = line.faces.last?.1 {
  equal(line.faces.count, 3, "five typing: three faces, then the count")
  equal(line.faces.first?.1.size, CGSize(width: 18, height: 18), "stacked faces are 18")
  check(chip.frame.minX < last.maxX, "the count overlaps the last face")
  check(chip.frame.height >= 18 + 2 * line.faceRing - 0.5, "the count is at least a face, with its ring")
  check(label.frame.minX >= chip.frame.maxX - line.faceRing, "the label starts after the count")
  check(abs(line.dots[0].midY - last.midY) < 0.5, "the dots are centered on the faces' line")
} else { check(false, "five people typing, stacked") }
if let bubble = typingPeople(5, "bubbles"), let chip = bubble.overflow, let last = bubble.faces.last?.1, let frame = bubble.bubble {
  equal(bubble.faces.first?.1.size, CGSize(width: 28, height: 28), "bubbles faces are 28")
  check(chip.frame.minX < last.maxX, "the count overlaps the last face")
  check(chip.frame.width >= 28 + 4, "the count is at least a face, with its 2-point ring")
  check(frame.minX >= chip.frame.maxX - 2 + Metrics.avatarGap - 0.5, "the bubble starts a gap after the count")
} else { check(false, "five people typing, bubbles") }

// Insets: a send's shorter composer goes in with the message sent, a
// freeze holds them, the order props arrive in doesn't matter, and only the
// latest insets JavaScript sent can ever go in.
let tall = UIEdgeInsets(top: 100, left: 0, bottom: 120, right: 0)
let short = UIEdgeInsets(top: 100, left: 0, bottom: 80, right: 0)
let medium = UIEdgeInsets(top: 100, left: 0, bottom: 100, right: 0)
var gate = InsetsGate(applied: tall)
gate.received(short)
equal(gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 7), .withRows(version: 7), "with the rows of the same batch")
equal(gate.applied, tall, "not before those rows")
equal(gate.take(forRows: 6, frozen: false), nil, "not with rows measured before them")
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .none, "a later batch without insets keeps them waiting")
equal(gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 8), .none, "so do later rows without insets")
equal(gate.take(forRows: 7, frozen: false), short, "with their rows")
equal(gate.applied, short, "then applied")
equal(gate.take(forRows: 8, frozen: false), nil, "and only once")

// Back to what's laid out while those rows are measured: nothing goes in.
gate = InsetsGate(applied: tall)
gate.received(short)
_ = gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 7)
gate.received(tall)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .none, "a revert changes nothing now")
equal(gate.take(forRows: 7, frozen: false), nil, "and the rows don't bring the old insets in")
equal(gate.applied, tall, "the list keeps what JavaScript last sent")

// Newer insets with newer rows, before the older rows are measured: the
// older result takes nothing, the newer one takes the newer insets.
gate = InsetsGate(applied: tall)
gate.received(short)
_ = gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 7)
gate.received(medium)
equal(gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 8), .withRows(version: 8), "newer insets wait for their own rows")
equal(gate.take(forRows: 7, frozen: false), nil, "the older rows don't take the newer insets")
equal(gate.take(forRows: 8, frozen: false), medium, "their rows do")
equal(gate.applied, medium, "never the older value")

// Newer insets alone replace those waiting for rows, at once.
gate = InsetsGate(applied: tall)
gate.received(short)
_ = gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 7)
gate.received(medium)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .now(medium, eased: false), "newer insets alone: at once")
equal(gate.take(forRows: 7, frozen: false), nil, "and the rows after bring nothing older")

gate = InsetsGate(applied: tall)
gate.received(short)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .now(short, eased: false), "alone: at once")
gate.received(short)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .none, "the same again: nothing")

// A freeze holds them; replaced or reverted during it, the thaw brings
// only the latest.
gate = InsetsGate(applied: tall)
gate.received(short)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 1), .none, "frozen: they wait")
equal(gate.take(forRows: 5, frozen: true), nil, "rows while frozen don't take them")
gate.thawed()
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 5), .now(short, eased: true), "at the thaw, eased")

gate = InsetsGate(applied: tall)
gate.received(short)
_ = gate.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 7)
_ = gate.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 7)
equal(gate.take(forRows: 7, frozen: true), nil, "their rows arriving frozen don't take them")
gate.received(medium)
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 7), .none, "replaced while frozen: still waiting")
gate.thawed()
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 7), .now(medium, eased: true), "the thaw brings the replacement")
equal(gate.take(forRows: 7, frozen: false), nil, "and the old rows bring nothing after")

gate = InsetsGate(applied: tall)
gate.received(short)
_ = gate.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 1)
gate.received(tall)
_ = gate.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 1)
gate.thawed()
equal(gate.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 1), .none, "reverted while frozen: the thaw changes nothing")
equal(gate.applied, tall, "still what JavaScript last sent")

for thawFirst in [true, false] {
  var order = InsetsGate(applied: tall)
  _ = order.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 0)
  if thawFirst { order.thawed(); order.received(short) } else { order.received(short); order.thawed() }
  equal(order.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 9), .withRows(version: 9),
        "thaw and insets with rows, \(thawFirst ? "thaw first" : "insets first"): with the rows")
}

gate = InsetsGate(applied: tall)
gate.received(short)
equal(gate.batchEnded(rowsChanged: true, placed: false, frozen: false, rowsVersion: 1), .now(short, eased: false), "before the first rows are placed: at once")

// Stacked typing shows the photos one-on-one too (integration's map-rows,
// as React Native's typing line); bubbles don't.
equal(typing("stacked", showFaces: true)?.faces.count, 1, "stacked, showFaces true: the other person's photo")
check(typing("stacked", showFaces: true).map { $0.label!.frame.minX < theme.horizontalPadding + theme.avatarSize + 12 } == true,
      "and the label after it, not at the text column")

// MARK: All list taps dispatch on the first release (approved 2026-10-24)

// UIKit owns tap/hold/pan recognition. These sequence checks exercise the
// production routing policy at touch-down and release, including movement
// between adjacent targets. They do not synthesize UIKit recognition timing.
equal(TapRoute(onReaction: false, element: "media"), .media, "a photo, video, carousel card or deck card: the media tap")
equal(TapRoute(onReaction: true, element: "media"), .reaction, "a reaction over a card: the reaction tap, not the photo")
for element in ["message", "link", "mention", "quote", "file", "linkCard", "author", "replies", "notSent"] {
  equal(TapRoute(onReaction: false, element: element), .message, "\(element): the message's first-release tap")
}
equal(TapRoute(onReaction: false, element: nil), .message, "nothing hit: the message route, with hit testing still required")

func tapReleases(_ touches: [(TapRoute, TapRoute)]) -> [TapRoute.Recognizer] {
  touches.flatMap { down, up in
    TapRoute.Recognizer.allCases.filter { down.receives($0) && up.receives($0) }
  }
}

for (route, recognizer) in [(TapRoute.message, TapRoute.Recognizer.tap), (.media, .mediaPress), (.reaction, .reactionTap)] {
  equal(tapReleases([(route, route)]), [recognizer], "\(route): dispatch on the first release without another touch")
  equal(tapReleases([(route, route), (route, route)]), [recognizer, recognizer], "\(route): two releases remain two presses, never a menu")
}
// A short move within tap slop must not turn the original route's release
// into another target's action. A fresh subsequent touch can use that target.
for down in [TapRoute.message, .media, .reaction] {
  for up in [TapRoute.message, .media, .reaction] where down != up {
    equal(tapReleases([(down, up)]), [], "\(down) down, \(up) up: no cross-target dispatch")
    let expected = TapRoute.Recognizer.allCases.filter { up.receives($0) }
    equal(tapReleases([(down, up), (up, up)]), expected, "\(down) to \(up), then a new tap: only the new release dispatches")
  }
}
equal(tapReleases([(.message, .message), (.media, .media), (.reaction, .reaction), (.message, .message)]),
      [.tap, .mediaPress, .reactionTap, .tap], "successive text, photo, reaction and text taps keep independent actions")
equal(tapReleases([(.message, .message), (.message, .media)]), [.tap], "text tap followed by text down/media up cannot open media or its menu")
equal(tapReleases([(.media, .media), (.message, .message)]), [.mediaPress, .tap], "media then text dispatches both releases without double-tap arbitration")

// MARK: A freeze starts between the paired props and their worker result

var pair = InsetsGate(applied: tall)
var work = RowApplyOrder()
let released = work.request()
pair.received(short)
_ = pair.batchEnded(rowsChanged: true, placed: true, frozen: false, rowsVersion: 10)
check(pair.carriesInsets(forRows: 10), "released rows carry their shorter composer")
check(!pair.carriesInsets(forRows: 9), "a pre-release worker result does not carry it")
// The freeze begins before the result. Neither side of the pair commits.
work.hold()
check(work.held && work.accepts(released), "the current measured pair stays held through freeze")
equal(pair.take(forRows: 10, frozen: true), nil, "the frozen pair cannot commit its inset")
equal(pair.applied, tall, "visible geometry is still the pre-send geometry")
pair.thawed()
equal(pair.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 10, holdingRows: work.held), .withRows(version: 10),
      "thaw resumes the pair, never a standalone inset first")
equal(pair.applied, tall, "even thaw waits for the held row apply")
equal(pair.take(forRows: 10, frozen: false), short, "the resumed row apply commits its inset once")
work.applied()
check(!work.held, "landing may start after the paired apply")

// A pair first received while already frozen must also have a row identity.
pair = InsetsGate(applied: tall)
pair.received(short)
equal(pair.batchEnded(rowsChanged: true, placed: true, frozen: true, rowsVersion: 11), .none, "already frozen: no immediate commit")
check(pair.carriesInsets(forRows: 11), "already frozen still records the paired rows")
pair.received(medium)
_ = pair.batchEnded(rowsChanged: true, placed: true, frozen: true, rowsVersion: 12, holdingRows: true)
check(!pair.carriesInsets(forRows: 11), "newer paired props supersede the held row version")
pair.thawed()
_ = pair.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 12, holdingRows: true)
equal(pair.take(forRows: 11, frozen: false), nil, "old completion cannot take the replacement inset")
equal(pair.take(forRows: 12, frozen: true), nil, "refreeze before completion keeps the replacement paired")
equal(pair.take(forRows: 12, frozen: false), medium, "only latest rows take latest inset after thaw")

pair = InsetsGate(applied: tall)
pair.received(short)
_ = pair.batchEnded(rowsChanged: true, placed: true, frozen: true, rowsVersion: 13)
pair.received(tall)
_ = pair.batchEnded(rowsChanged: false, placed: true, frozen: true, rowsVersion: 13, holdingRows: true)
pair.thawed()
equal(pair.batchEnded(rowsChanged: false, placed: true, frozen: false, rowsVersion: 13, holdingRows: true), .none,
      "reverting to applied cancels an inset even while its rows are held")
equal(pair.take(forRows: 13, frozen: false), nil, "thaw never resurrects that canceled inset")
equal(pair.applied, tall, "canceled pair resumes rows with the geometry already applied")

work = RowApplyOrder()
let oldWork = work.request()
work.hold()
let resizedWork = work.request()
check(!work.accepts(oldWork), "new width/theme/custom measurement supersedes a result even with the same rows version")
check(work.accepts(resizedWork) && work.held, "fresh measurement preserves the landing/keyboard barrier")
work.detached()
check(!work.accepts(resizedWork) && !work.held, "detach invalidates callbacks and discards the local barrier")
let reattachedWork = work.request()
check(work.accepts(reattachedWork), "reattach accepts only fresh work")

// Generic latest intent is not consumed by a row apply or a scroll-end.
var latest = LatestIntent()
latest.begin(rowsVersion: 20)
let firstNavigation = latest.generation
check(!latest.follows(rowsVersion: 19, generation: firstNavigation), "pre-command rows cannot retarget latest")
check(latest.follows(rowsVersion: 20, generation: firstNavigation), "current layout may follow the generic command")
check(latest.follows(rowsVersion: 21, generation: firstNavigation), "the released send retargets the same smooth intent")
check(latest.follows(rowsVersion: 22, generation: firstNavigation), "later applies don't consume the generic intent")
latest.begin(rowsVersion: 23)
let secondNavigation = latest.generation
check(!latest.follows(rowsVersion: 24, generation: firstNavigation), "an older retarget callback cannot override a newer true command")
check(!latest.follows(rowsVersion: 22, generation: secondNavigation), "new command's floor rejects older measured rows")
check(latest.follows(rowsVersion: 23, generation: secondNavigation), "newest command follows its own layout")
latest.cancel()
check(!latest.follows(rowsVersion: 24, generation: secondNavigation), "drag, stop-touch, lift, explicit navigation or detach cancels follow")
latest.begin(rowsVersion: 25)
check(latest.follows(rowsVersion: 25, generation: latest.generation), "a new explicit command works after user interruption")

// MARK: Composer layout revision 3, mounted geometry and release authority

func composerBinding(_ release: Int, owner: String = "composer", gap: CGFloat = 8) -> ComposerLayout.Binding {
  ComposerLayout.Binding(json: ["owner": owner, "release": release, "gap": gap])!
}
let composerHostA = NSObject()
let composerHostB = NSObject()
func composerSample(_ sequence: Int, _ height: CGFloat, secondHost: Bool = false) -> ComposerLayout.Sample {
  ComposerLayout.Sample(host: ObjectIdentifier(secondHost ? composerHostB : composerHostA), sequence: sequence, height: height)
}
func composerInset(_ bottom: CGFloat, top: CGFloat = 12) -> UIEdgeInsets {
  UIEdgeInsets(top: top, left: 0, bottom: bottom, right: 0)
}
var composer = ComposerLayout()
check(composer.configure(composerBinding(0), inset: composerInset(84)), "binding creates an initial apply barrier")
let beforeSeal = composer.capture(inset: .zero, fallback: composerInset(84))!
check(!composer.canApply(beforeSeal), "initial synchronous measurement cannot apply before complete mount")
composer.seal(composerSample(0, 76))
check(!composer.accepts(beforeSeal), "first actual host establishes a fresh result generation")
let initialComposer = composer.capture(inset: .zero, fallback: composerInset(84))!
check(composer.canApply(initialComposer), "complete mount authorizes initial placement")
equal(composer.target(for: initialComposer, current: .zero, top: 12), composerInset(84), "actual bar76 plus explicit gap8 once")
composer.applied(initialComposer)
composer.seal(composerSample(0, 98))
equal(composer.ordinary(current: composerInset(84), react: composerInset(84), blocked: false), composerInset(106), "ordinary newline follows actual mounted height without React bottom")
equal(composer.ordinary(current: composerInset(106), react: composerInset(84, top: 20), blocked: false), composerInset(106, top: 20), "top remains React-owned while bottom stays native")
equal(composer.ordinary(current: composerInset(84), react: composerInset(84), blocked: true), nil, "freeze, held pair, lift and actual landing block ordinary writes")

// The clear mounts before the list's new props: host sequence alone holds.
composer.seal(composerSample(1, 76))
equal(composer.ordinary(current: composerInset(106), react: composerInset(84), blocked: false), nil, "host ahead of applied release holds its clear immediately")
check(composer.configure(composerBinding(1), inset: composerInset(84)), "same-height/cancel release alone creates work, with no rows change")
let releaseOneUnsealed = composer.capture(inset: composerInset(106), fallback: composerInset(84))!
check(!composer.canApply(releaseOneUnsealed), "release setter is not a mount seal")
composer.seal(composerSample(1, 120))
let releaseOne = composer.capture(inset: composerInset(106), fallback: composerInset(84))!
equal(composer.target(for: releaseOne, current: composerInset(106), top: 12), composerInset(128), "new draft in matching sequence co-applies actual120 plus gap once")
check(composer.pending, "React release/publication does not clear worker apply barrier")
equal(composer.ordinary(current: composerInset(106), react: composerInset(128), blocked: false), nil, "standalone ordinary report cannot supersede pending pair")

// S was released, then T cleared before S's result. S cannot borrow T.
composer.seal(composerSample(2, 60))
check(composer.canApply(releaseOne), "older authorized S can finish when host has advanced to T")
equal(composer.target(for: releaseOne, current: composerInset(106), top: 12), composerInset(84), "S uses captured React paired inset, never T's actual height")
composer.applied(releaseOne)
equal(composer.appliedRelease, 1, "finishing S cannot mark T applied")
equal(composer.ordinary(current: composerInset(84), react: composerInset(68), blocked: false), nil, "T stays held after S completion")
_ = composer.configure(composerBinding(2), inset: composerInset(68))
composer.seal(composerSample(2, 76))
let releaseTwo = composer.capture(inset: composerInset(84), fallback: composerInset(68))!
composer.applied(releaseOne)
check(composer.pending, "duplicate S completion cannot unblock released T")
equal(composer.target(for: releaseTwo, current: composerInset(84), top: 12), composerInset(84), "matching T can apply changed actual geometry even if ACK scalar was68")
composer.applied(releaseTwo)
equal(composer.appliedRelease, 2, "T advances only at its native apply")

// Missing/ambiguous/wrong-surface hosts all arrive as nil after full mount.
let oldBoundResult = composer.capture(inset: composerInset(84), fallback: composerInset(68))!
composer.seal(nil)
check(composer.legacy, "missing host explicitly enters legacy mode")
check(!composer.accepts(oldBoundResult), "missing host invalidates cached result lifetime")
let missingHostResult = composer.capture(inset: composerInset(84), fallback: composerInset(68))!
check(composer.canApply(missingHostResult), "absent host cannot hide an authorized row indefinitely")
equal(composer.target(for: missingHostResult, current: composerInset(84), top: 12), composerInset(84), "legacy transition retains current geometry, not stale React68")
equal(composer.ordinary(current: composerInset(84), react: composerInset(68), blocked: false), nil, "weak-host loss alone cannot replay arbitrary old bottom")
_ = composer.configure(composerBinding(2), inset: composerInset(98))
composer.seal(nil)
equal(composer.ordinary(current: composerInset(84), react: composerInset(98), blocked: false), composerInset(98), "a subsequent actual React fallback report can follow in legacy mode")
_ = composer.configure(composerBinding(3), inset: composerInset(84))
composer.seal(nil)
let missingRelease = composer.capture(inset: composerInset(98), fallback: composerInset(84))!
check(composer.canApply(missingRelease), "canceled/no-change release with no host uses explicit legacy barrier")
equal(composer.target(for: missingRelease, current: composerInset(98), top: 12), composerInset(84), "missing-host release uses captured authorized inset")
composer.applied(missingRelease)

composer.seal(composerSample(3, 98, secondHost: true))
check(!composer.accepts(missingRelease), "rebind creates a fresh generation")
equal(composer.appliedRelease, 3, "rebind preserves applied release")
equal(composer.ordinary(current: composerInset(84), react: composerInset(84), blocked: false), composerInset(106), "fresh host can resume current ordinary geometry")
composer.seal(composerSample(2, 76, secondHost: true))
check(composer.legacy, "host sequence regression falls back rather than resets applied release")
equal(composer.appliedRelease, 3, "regression cannot regress authority")
_ = composer.configure(composerBinding(2), inset: composerInset(12))
composer.seal(composerSample(3, 98, secondHost: true))
check(composer.legacy, "regressed release publisher remains legacy until it catches up")
equal(composer.binding?.release, 3, "old release cannot replace latest authorized sequence")
_ = composer.configure(composerBinding(3), inset: composerInset(84))
composer.seal(composerSample(3, 98, secondHost: true))
check(!composer.legacy, "valid publisher can establish a fresh bound lifetime")
let detachedAuthority = composer.capture(inset: composerInset(106), fallback: composerInset(84))!
composer.detach()
check(!composer.accepts(detachedAuthority), "detach rejects pending owner callbacks/results")
check(!composer.sealed, "detach needs a new complete mount")
_ = composer.configure(composerBinding(0, owner: "other"), inset: composerInset(84))
composer.seal(composerSample(0, 76))
check(!composer.accepts(detachedAuthority), "another conversation cannot use old owner's result")
equal(composer.appliedRelease, 0, "only an explicit owner lifetime change starts a new release space")
_ = composer.configure(nil, inset: composerInset(84))
equal(composer.capture(inset: composerInset(84), fallback: composerInset(84)), nil, "binding nil explicitly restores the old React path")

// Same-store remount replays persistent release without waiting for new rows.
var remountedComposer = ComposerLayout()
_ = remountedComposer.configure(composerBinding(4, gap: 13), inset: composerInset(89))
remountedComposer.seal(composerSample(4, 76))
let replay = remountedComposer.capture(inset: .zero, fallback: composerInset(89))!
check(remountedComposer.canApply(replay), "published release can replay on a new list")
equal(remountedComposer.target(for: replay, current: .zero, top: 12), composerInset(89), "gap is explicit13, never native magic8")
remountedComposer.applied(replay)
equal(remountedComposer.appliedRelease, 4, "replay completes persistent authority")
let invalidComposerBindings: [JSON] = [["owner": "", "release": 0, "gap": 8], ["owner": "x", "release": -1, "gap": 8], ["owner": "x", "release": 0.5, "gap": 8], ["owner": "x", "release": 1, "gap": -1]]
for invalid in invalidComposerBindings {
  equal(ComposerLayout.Binding(json: invalid), nil, "invalid binding cannot establish an authority")
}
var landingTokens = ComposerLandingTokens()
let oldLanding = landingTokens.begin()
let newLanding = landingTokens.begin()
check(landingTokens.active, "landing blocks ordinary geometry before real restoration")
check(landingTokens.restored(oldLanding), "old landing restores its own views")
check(landingTokens.active, "old completion cannot release a newer landing")
check(!landingTokens.restored(oldLanding), "duplicate old completion cannot restore/unblock twice")
check(landingTokens.restored(newLanding), "new landing has its own restoration token")
check(!landingTokens.active, "ordinary geometry may resume only after all real restores")

// CLOSE grants a fixed release ceiling, not a general frozen-geometry flush.
var closingComposer = ComposerLayout()
_ = closingComposer.configure(composerBinding(0), inset: composerInset(128))
closingComposer.seal(composerSample(0, 120))
closingComposer.applied(closingComposer.capture(inset: .zero, fallback: composerInset(128))!)
var closing = ComposerClose()
closing.begin(closingComposer.capture(inset: composerInset(128), fallback: composerInset(128)), applied: 0, work: 10)
equal(closing.permission?.token, nil, "normal no-pair close never waits or gains a frozen flush")
closingComposer.seal(composerSample(1, 76))
closing.begin(closingComposer.capture(inset: composerInset(128), fallback: composerInset(84)), applied: 0, work: 10)
equal(closing.permission?.token, nil, "unreleased host ahead cannot delay normal frozen close")

_ = closingComposer.configure(composerBinding(1), inset: composerInset(84))
let closingS = closingComposer.capture(inset: composerInset(128), fallback: composerInset(84))!
closing.begin(closingS, applied: 0, work: 11)
check(closing.current(in: closingComposer), "close before worker finish captures already authorized S")
check(!closing.permits(closingS, work: 11, layout: closingComposer), "even explicit close cannot bypass complete mount seal")
closingComposer.seal(composerSample(1, 76))
check(closing.permits(closingS, work: 11, layout: closingComposer), "matching worker can flush S after complete mount")
check(!closing.permits(closingS, work: 10, layout: closingComposer), "pre-close result generation cannot use close permission")
check(closing.permits(closingS, work: 12, layout: closingComposer), "fresh full remeasurement of the same authorized S retains permission")
let closeBeforeWorker = closing.permission!.token
closing.begin(closingS, applied: 0, work: 12)
check(closing.permission!.token != closeBeforeWorker, "a replacement close has a distinct token")
check(!closing.permits(closingS, work: 11, layout: closingComposer), "replacement close rejects prior worker floor")
check(closing.permits(closingS, work: 12, layout: closingComposer), "close after held worker finish can flush that current result")

closingComposer.seal(composerSample(2, 60))
check(closing.permits(closingS, work: 12, layout: closingComposer), "newer unreleased host T does not expand or cancel authorized S")
equal(closingComposer.target(for: closingS, current: composerInset(128), top: 12), composerInset(84), "frozen close S uses captured S inset, never mounted T60")
closingComposer.applied(closingS)
equal(closingComposer.appliedRelease, 1, "close flush releases only S")
equal(closingComposer.ordinary(current: composerInset(84), react: composerInset(68), blocked: false), nil, "T remains held after the close S apply")
closing.cancel()
check(!closing.permits(closingS, work: 12, layout: closingComposer), "real landing consumes close permission before restoration")

_ = closingComposer.configure(composerBinding(2), inset: composerInset(68))
closingComposer.seal(composerSample(2, 60))
let closingT = closingComposer.capture(inset: composerInset(84), fallback: composerInset(68))!
closing.begin(closingT, applied: 1, work: 13)
check(closing.permits(closingT, work: 13, layout: closingComposer), "later explicit close can authorize T independently")
check(closing.cancel(), "refreeze/new lift cancels the active close handoff")
check(!closing.permits(closingT, work: 13, layout: closingComposer), "refreeze/new lift cannot run an obsolete frozen apply")
closing.begin(closingT, applied: 1, work: 14)
_ = closingComposer.configure(composerBinding(3), inset: composerInset(84))
closingComposer.seal(composerSample(3, 76))
check(!closing.current(in: closingComposer), "new authorized release invalidates older close instead of widening it")
let closingNewer = closingComposer.capture(inset: composerInset(84), fallback: composerInset(84))!
check(!closing.permits(closingNewer, work: 14, layout: closingComposer), "S close cannot flush newer authorized result T")
closing.begin(closingNewer, applied: 1, work: 15)
closingComposer.seal(nil)
check(!closing.current(in: closingComposer), "missing-host lifetime change cancels obsolete close generation")
let closingLegacy = closingComposer.capture(inset: composerInset(84), fallback: composerInset(84))!
closing.begin(closingLegacy, applied: 1, work: 16)
check(closing.permits(closingLegacy, work: 16, layout: closingComposer), "explicit legacy release can close after its complete missing-host seal")
closingComposer.detach()
check(!closing.current(in: closingComposer), "detach invalidates the old close owner lifetime")
_ = closingComposer.configure(composerBinding(3, owner: "other"), inset: composerInset(84))
closingComposer.seal(composerSample(3, 76))
check(!closing.permits(closingLegacy, work: 17, layout: closingComposer), "new owner never inherits an old close permission")

print("\(checks - failures) of \(checks) checks passed")
exit(failures == 0 ? 0 : 1)
