import Foundation

// The contract's rows, blocks, theme, and behavior as Swift values
// (src/features/native-list/contract.ts). Decoding is forgiving: unknown
// fields are ignored, missing ones take defaults, and an unknown row kind
// or block type becomes `.unknown`, which is drawn as the row's
// `fallbackText`. Nothing here throws or crashes on bad input.

typealias JSON = [String: Any]

extension Dictionary where Key == String, Value == Any {
  func string(_ key: String) -> String? { self[key] as? String }
  func str(_ key: String, _ fallback: String = "") -> String { (self[key] as? String) ?? fallback }
  func bool(_ key: String) -> Bool {
    if let value = self[key] as? Bool { return value }
    if let value = self[key] as? NSNumber { return value.boolValue }
    return false
  }
  func double(_ key: String) -> Double? {
    var value: Double?
    if let number = self[key] as? Double { value = number }
    else if let number = self[key] as? NSNumber { value = number.doubleValue }
    else if let number = self[key] as? Int { value = Double(number) }
    return value.flatMap { $0.isNaN ? nil : $0 }
  }

  /// A whole number, clamped so a huge or infinite value can't trap.
  func int(_ key: String, _ fallback: Int, max: Int = 1_000_000) -> Int {
    guard let value = double(key) else { return fallback }
    return Int(Swift.min(Swift.max(value, 0), Double(max)))
  }
  /// A size or position: finite, or the fallback.
  func cg(_ key: String, _ fallback: CGFloat) -> CGFloat {
    double(key).flatMap { $0.isFinite ? CGFloat($0) : nil } ?? fallback
  }
  func object(_ key: String) -> JSON? { self[key] as? JSON }
  func objects(_ key: String) -> [JSON] { (self[key] as? [Any])?.compactMap { $0 as? JSON } ?? [] }
}

struct Person: Equatable {
  let id: String
  let name: String
  let avatarUrl: URL?
  let initials: String

  init(_ json: JSON?) {
    let json = json ?? [:]
    id = json.str("id")
    name = json.str("name")
    avatarUrl = json.string("avatarUrl").flatMap(URL.init(string:))
    initials = json.str("initials", String(json.str("name").prefix(1)))
  }
}

struct Span: Equatable {
  enum Style: String { case mention, link, bold, italic, code }
  let text: String
  let style: Style?
  let url: String?
  let accountId: String?

  init(_ json: JSON) {
    text = json.str("text")
    style = json.string("style").flatMap(Style.init(rawValue:))
    url = json.string("url")
    accountId = json.string("accountId")
  }

  init(text: String) {
    self.text = text
    style = nil
    url = nil
    accountId = nil
  }
}

struct Reaction: Equatable {
  let key: String
  let emoji: String?
  let imageUrl: URL?
  let label: String
  let count: Int
  let mine: Bool

  init(_ json: JSON) {
    key = json.str("key")
    let content = json.object("content") ?? [:]
    emoji = content.string("emoji")
    imageUrl = content.string("imageUrl").flatMap(URL.init(string:))
    label = content.string("label") ?? content.string("emoji") ?? json.str("key")
    count = json.int("count", 1)
    mine = json.bool("mine")
  }
}

struct MediaItem: Equatable {
  enum Kind: String { case image, video }
  let id: String
  let kind: Kind
  let url: URL?
  let thumbnailUrl: URL?
  let localUrl: URL?
  let width: CGFloat
  let height: CGFloat
  let durationSeconds: Double?
  let part: String
  let reactions: [Reaction]
  let uploading: Bool

  init(_ json: JSON) {
    id = json.str("id")
    kind = json.string("kind").flatMap(Kind.init(rawValue:)) ?? .image
    url = json.string("url").flatMap(URL.init(string:))
    thumbnailUrl = json.string("thumbnailUrl").flatMap(URL.init(string:))
    localUrl = json.string("localUrl").flatMap(URL.init(string:))
    width = max(1, json.cg("width", 1))
    height = max(1, json.cg("height", 1))
    durationSeconds = json.double("durationSeconds").flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
    part = json.str("part")
    reactions = json.objects("reactions").map(Reaction.init)
    uploading = json.bool("uploading")
  }

  /// What to show in the list: the local file while it uploads, then the
  /// smaller rendition (or the video's poster), then the full size.
  var displayUrl: URL? {
    if let localUrl { return localUrl }
    if let thumbnailUrl { return thumbnailUrl }
    return kind == .image ? url : nil
  }
}

struct FooterLine: Equatable {
  enum Kind: String { case replies, edited, notSent }
  let kind: Kind
  let text: String
  let people: [Person]

  init?(_ json: JSON) {
    guard let kind = json.string("kind").flatMap(Kind.init(rawValue:)) else { return nil }
    self.kind = kind
    text = json.str("text")
    people = json.objects("people").map { Person($0) }
  }
}

enum Block: Equatable {
  case text(spans: [Span], jumbo: Bool, part: String?)
  case media(items: [MediaItem], part: String?)
  case file(name: String, sizeLabel: String, url: String, part: String?)
  case linkCard(LinkCard)
  case quote(author: Person, text: String, thumbnailUrl: URL?, messageId: String, part: String?)
  case deleted(label: String, part: String?)
  case unknown

  struct LinkCard: Equatable {
    let url: String
    let title: String?
    let description: String?
    let imageUrl: URL?
    let imageWidth: CGFloat?
    let imageHeight: CGFloat?
    let site: String
    let part: String?
  }

  init(_ json: JSON) {
    let part = json.string("part")
    switch json.string("type") {
    case "text":
      self = .text(spans: json.objects("spans").map(Span.init), jumbo: json.bool("jumbo"), part: part)
    case "media":
      let items = json.objects("items").map(MediaItem.init)
      self = items.isEmpty ? .unknown : .media(items: items, part: part)
    case "file":
      self = .file(name: json.str("name"), sizeLabel: json.str("sizeLabel"), url: json.str("url"), part: part)
    case "linkCard":
      self = .linkCard(LinkCard(
        url: json.str("url"),
        title: json.string("title"),
        description: json.string("description"),
        imageUrl: json.string("imageUrl").flatMap(URL.init(string:)),
        imageWidth: json.double("imageWidth").map { CGFloat($0) },
        imageHeight: json.double("imageHeight").map { CGFloat($0) },
        site: json.str("site"),
        part: part
      ))
    case "quote":
      self = .quote(
        author: Person(json.object("author")),
        text: json.str("text"),
        thumbnailUrl: json.string("thumbnailUrl").flatMap(URL.init(string:)),
        messageId: json.str("messageId"),
        part: part
      )
    case "deleted":
      self = .deleted(label: json.str("label"), part: part)
    default:
      self = .unknown
    }
  }

  var part: String? {
    switch self {
    case let .text(_, _, part), let .media(_, part), let .file(_, _, _, part),
         let .quote(_, _, _, _, part), let .deleted(_, part):
      return part
    case let .linkCard(card): return card.part
    case .unknown: return nil
    }
  }
}

struct MessageRow: Equatable {
  enum Layout: String { case bubbles, stacked }
  enum Status: String { case sending, failed }
  let layout: Layout
  let author: Person
  let isOwn: Bool
  let showAuthor: Bool
  let startsGroup: Bool
  let endsGroup: Bool
  let sentAt: Double
  let timeLabel: String
  let blocks: [Block]
  let reactions: [Reaction]
  let footer: [FooterLine]
  let status: Status?
  let highlighted: Bool
  let arrived: Bool
  let accessibilityLabel: String

  init(_ json: JSON, fallbackText: String?) {
    layout = json.string("layout").flatMap(Layout.init(rawValue:)) ?? .bubbles
    author = Person(json.object("author"))
    isOwn = json.bool("isOwn")
    showAuthor = json.bool("showAuthor")
    startsGroup = json["startsGroup"] == nil ? true : json.bool("startsGroup")
    endsGroup = json["endsGroup"] == nil ? true : json.bool("endsGroup")
    sentAt = json.double("sentAt") ?? 0
    timeLabel = json.str("timeLabel")
    var blocks = json.objects("blocks").map(Block.init)
    // An unknown block means this binary can't draw the message as sent:
    // draw its fallback text in the message's place, as the contract says.
    if blocks.contains(.unknown) {
      blocks = [.text(spans: [Span(text: fallbackText ?? "")], jumbo: false, part: nil)]
    }
    self.blocks = blocks
    reactions = json.objects("reactions").map(Reaction.init)
    footer = json.objects("footer").compactMap(FooterLine.init)
    status = json.string("status").flatMap(Status.init(rawValue:))
    highlighted = json.bool("highlighted")
    arrived = json.bool("arrived")
    accessibilityLabel = json.str("accessibilityLabel")
  }
}

enum RowContent: Equatable {
  case message(MessageRow)
  case header(style: String, label: String)
  case notice(spans: [Span])
  /// `showFaces`: photos of who's typing (groups and spaces, not
  /// one-on-one). Older JavaScript doesn't send it: faces show then.
  case typing(layout: MessageRow.Layout, people: [Person], label: String, showFaces: Bool)
  /// A custom row: drawn by React (CustomRows.swift) once its view is
  /// mounted, its fallback text until then.
  case custom(fallbackText: String)
  /// A kind this binary doesn't know: its fallback text.
  case fallback(text: String)
}

struct Row: Equatable {
  let id: String
  let content: RowContent

  init(_ json: JSON) {
    id = json.str("id", UUID().uuidString)
    let fallbackText = json.string("fallbackText")
    switch json.string("kind") {
    case "message":
      content = .message(MessageRow(json, fallbackText: fallbackText))
    case "header":
      content = .header(style: json.str("style", "time"), label: json.str("label"))
    case "notice":
      content = .notice(spans: json.objects("spans").map(Span.init))
    case "typing":
      content = .typing(
        layout: json.string("layout").flatMap(MessageRow.Layout.init(rawValue:)) ?? .bubbles,
        people: json.objects("people").map { Person($0) },
        label: json.str("label"),
        showFaces: json["showFaces"] == nil ? true : json.bool("showFaces")
      )
    case "custom":
      content = .custom(fallbackText: fallbackText ?? "")
    default:
      content = .fallback(text: fallbackText ?? "")
    }
  }

  var message: MessageRow? {
    if case let .message(message) = content { return message }
    return nil
  }

  var isTyping: Bool {
    if case .typing = content { return true }
    return false
  }
}

/// A reaction toggled by a tap, shown at once while JavaScript catches up
/// (MessageListView's `reactionOverrides`): the row's JSON as JavaScript
/// would send it once it has.
enum ReactionToggle {
  /// Whether the reaction `key` in the row is yours, if the row has it.
  static func mine(_ row: JSON, key: String) -> Bool? {
    for list in lists(row) {
      if let reaction = list.first(where: { $0.str("key") == key }) { return reaction.bool("mine") }
    }
    return nil
  }

  /// The row with the reaction `key` made yours or not: its count up or
  /// down by one, and gone at zero. Unchanged if it's already so, or the
  /// row doesn't have it.
  static func setting(_ row: JSON, key: String, mine: Bool) -> JSON {
    func apply(_ reactions: [JSON]) -> [JSON] {
      reactions.compactMap { reaction in
        guard reaction.str("key") == key, reaction.bool("mine") != mine else { return reaction }
        var next = reaction
        let count = reaction.int("count", 1) + (mine ? 1 : -1)
        if count <= 0 { return nil }
        next["count"] = count
        next["mine"] = mine
        return next
      }
    }
    var row = row
    if row["reactions"] != nil { row["reactions"] = apply(row.objects("reactions")) }
    if let blocks = row["blocks"] as? [Any] {
      row["blocks"] = blocks.map { value -> Any in
        guard var block = value as? JSON, block.str("type") == "media", let items = block["items"] as? [Any] else { return value }
        block["items"] = items.map { value -> Any in
          guard var item = value as? JSON, item["reactions"] != nil else { return value }
          item["reactions"] = apply(item.objects("reactions"))
          return item
        }
        return block
      }
    }
    return row
  }

  private static func lists(_ row: JSON) -> [[JSON]] {
    var lists = [row.objects("reactions")]
    for block in row.objects("blocks") where block.str("type") == "media" {
      for item in block.objects("items") { lists.append(item.objects("reactions")) }
    }
    return lists
  }
}

struct Behavior: Equatable {
  var moveMs: Double = 420
  var fadeMs: Double = 400
  var firehoseFrom: Int = 8
  var firehoseUntil: Int = 3
  var firehoseWindowMs: Double = 2000
  var loadAheadScreens: CGFloat = 10
  var nearLatestPoints: CGFloat = 80

  init() {}

  init(_ json: JSON) {
    // Durations stay sane: nothing animates forever.
    moveMs = min(5000, max(0, json.double("moveMs") ?? moveMs))
    fadeMs = min(5000, max(0, json.double("fadeMs") ?? fadeMs))
    firehoseFrom = json.int("firehoseFrom", firehoseFrom)
    firehoseUntil = json.int("firehoseUntil", firehoseUntil)
    firehoseWindowMs = json.double("firehoseWindowMs") ?? firehoseWindowMs
    loadAheadScreens = json.cg("loadAheadScreens", loadAheadScreens)
    nearLatestPoints = json.cg("nearLatestPoints", nearLatestPoints)
  }
}

/// The contract's `lift`: where the held part goes, as the menu laid it out.
struct LiftRequest: Equatable {
  let rowId: String
  let part: String?
  let index: Int?
  /// Points down (negative is up), and the scale from its top corner on
  /// its side (`origin` start or end) or its top middle.
  let shift: CGFloat
  let scale: CGFloat
  let origin: String

  init?(_ json: JSON?) {
    guard let json, let rowId = json.string("rowId") else { return nil }
    self.rowId = rowId
    part = json.string("part")
    index = json["index"] == nil ? nil : json.int("index", 0)
    shift = json.cg("shift", 0)
    scale = max(0.2, min(2, json.cg("scale", 1)))
    origin = json.str("origin", "start")
  }
}
