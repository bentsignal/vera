package chat.vera.messagelist

import android.graphics.Color
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

// Reads the contract's JSON from JavaScript. Unknown fields are ignored, a
// missing or mistyped field takes a default, and a row or block this binary
// can't read is drawn as its fallback text: nothing JavaScript sends can
// crash the list (an over-the-air update may be newer than this binary).

private fun ReadableMap.type(key: String): ReadableType? =
  if (hasKey(key)) getType(key) else null

internal fun ReadableMap.str(key: String): String? =
  if (type(key) == ReadableType.String) getString(key) else null

internal fun ReadableMap.num(key: String): Double? =
  if (type(key) == ReadableType.Number) getDouble(key) else null

internal fun ReadableMap.bool(key: String): Boolean =
  type(key) == ReadableType.Boolean && getBoolean(key)

internal fun ReadableMap.boolOr(key: String, fallback: Boolean): Boolean =
  if (type(key) == ReadableType.Boolean) getBoolean(key) else fallback

internal fun ReadableMap.map(key: String): ReadableMap? =
  if (type(key) == ReadableType.Map) getMap(key) else null

internal fun ReadableMap.array(key: String): ReadableArray? =
  if (type(key) == ReadableType.Array) getArray(key) else null

private inline fun <T> ReadableArray?.mapsOf(read: (ReadableMap) -> T?): List<T> {
  if (this == null) return emptyList()
  val out = ArrayList<T>(size())
  for (index in 0 until size()) {
    if (getType(index) != ReadableType.Map) continue
    val map = getMap(index) ?: continue
    val value = try {
      read(map)
    } catch (_: Exception) {
      null
    }
    if (value != null) out.add(value)
  }
  return out
}

private fun person(map: ReadableMap?): Person {
  if (map == null) return Person("", "", null, "")
  val name = map.str("name") ?: ""
  return Person(
    id = map.str("id") ?: "",
    name = name,
    avatarUrl = map.str("avatarUrl"),
    initials = map.str("initials") ?: name.take(1).uppercase(),
  )
}

private fun spans(array: ReadableArray?): List<Span> =
  array.mapsOf { map ->
    Span(
      text = map.str("text") ?: return@mapsOf null,
      style = map.str("style"),
      url = map.str("url"),
      accountId = map.str("accountId"),
    )
  }

private fun reactions(array: ReadableArray?): List<Reaction> =
  array.mapsOf { map ->
    val content = map.map("content")
    Reaction(
      key = map.str("key") ?: return@mapsOf null,
      emoji = content?.str("emoji"),
      imageUrl = content?.str("imageUrl"),
      label = content?.str("label"),
      count = map.num("count")?.toInt() ?: 1,
      mine = map.bool("mine"),
    )
  }

private fun mediaItem(map: ReadableMap): MediaItem? {
  val url = map.str("url") ?: map.str("localUrl") ?: return null
  return MediaItem(
    id = map.str("id") ?: url,
    isVideo = map.str("kind") == "video",
    url = url,
    thumbnailUrl = map.str("thumbnailUrl"),
    localUrl = map.str("localUrl"),
    width = map.num("width")?.toInt() ?: 0,
    height = map.num("height")?.toInt() ?: 0,
    durationSeconds = map.num("durationSeconds"),
    part = map.str("part") ?: "",
    reactions = reactions(map.array("reactions")),
    uploading = map.bool("uploading"),
  )
}

private fun block(map: ReadableMap, fallback: String): Block {
  val part = map.str("part")
  return when (map.str("type")) {
    "text" -> TextBlock(spans(map.array("spans")), map.bool("jumbo"), part)
    "media" -> {
      val items = map.array("items").mapsOf(::mediaItem)
      if (items.isEmpty()) UnknownBlock(fallback, part) else MediaBlock(items, part)
    }
    "file" ->
      FileBlock(
        name = map.str("name") ?: "",
        sizeLabel = map.str("sizeLabel") ?: "",
        url = map.str("url") ?: "",
        part = part,
      )
    "linkCard" ->
      LinkCardBlock(
        url = map.str("url") ?: "",
        title = map.str("title"),
        description = map.str("description"),
        imageUrl = map.str("imageUrl"),
        imageWidth = map.num("imageWidth")?.toInt(),
        imageHeight = map.num("imageHeight")?.toInt(),
        site = map.str("site") ?: "",
        part = part,
      )
    "quote" ->
      QuoteBlock(
        author = person(map.map("author")),
        text = map.str("text") ?: "",
        thumbnailUrl = map.str("thumbnailUrl"),
        messageId = map.str("messageId") ?: "",
        part = part,
      )
    "deleted" -> DeletedBlock(map.str("label") ?: "", part)
    else -> UnknownBlock(map.str("fallbackText") ?: fallback, part)
  }
}

private fun footer(array: ReadableArray?): List<FooterLine> =
  array.mapsOf { map ->
    FooterLine(
      kind = map.str("kind") ?: "",
      text = map.str("text") ?: return@mapsOf null,
      people = people(map.array("people")),
    )
  }

private fun people(array: ReadableArray?): List<Person> = array.mapsOf { person(it) }

fun decodeRow(map: ReadableMap): Row? {
  val id = map.str("id") ?: return null
  val fallback = map.str("fallbackText") ?: ""
  return try {
    when (map.str("kind")) {
      "message" -> {
        var blocks = map.array("blocks").mapsOf { block(it, fallback) }
        // A block this binary can't draw means it can't draw the message as
        // sent: its fallback text takes the message's place (as on iOS).
        if (blocks.any { it is UnknownBlock }) blocks = listOf(TextBlock(listOf(Span(fallback, null, null, null)), false, null))
        MessageRow(
          id = id,
          stacked = map.str("layout") == "stacked",
          author = person(map.map("author")),
          isOwn = map.bool("isOwn"),
          showAuthor = map.bool("showAuthor"),
          startsGroup = map.boolOr("startsGroup", true),
          endsGroup = map.boolOr("endsGroup", true),
          sentAt = map.num("sentAt") ?: 0.0,
          timeLabel = map.str("timeLabel") ?: "",
          blocks = blocks.ifEmpty { listOf(UnknownBlock(fallback, null)) },
          reactions = reactions(map.array("reactions")),
          footer = footer(map.array("footer")),
          status = map.str("status"),
          highlighted = map.bool("highlighted"),
          arrived = map.bool("arrived"),
          accessibilityLabel = map.str("accessibilityLabel") ?: fallback,
        )
      }
      "header" -> {
        // A style this binary doesn't know is drawn as a day separator.
        val style = map.str("style").takeIf { it == "time" || it == "replies" } ?: "day"
        HeaderRow(id, style, map.str("label") ?: "")
      }
      "notice" -> NoticeRow(id, spans(map.array("spans")))
      "typing" ->
        TypingRow(
          id = id,
          stacked = map.str("layout") == "stacked",
          people = people(map.array("people")),
          label = map.str("label") ?: "",
          showFaces = map.boolOr("showFaces", true),
        )
      else -> FallbackRow(id, fallback)
    }
  } catch (_: Exception) {
    FallbackRow(id, fallback)
  }
}

/** The rows, newest first. Rows without an ID, or with one already used, are dropped. */
fun decodeRows(array: ReadableArray?): List<Row> {
  if (array == null) return emptyList()
  val seen = HashSet<String>(array.size() * 2)
  val out = ArrayList<Row>(array.size())
  for (index in 0 until array.size()) {
    if (array.getType(index) != ReadableType.Map) continue
    val row = decodeRow(array.getMap(index) ?: continue) ?: continue
    if (seen.add(row.id)) out.add(row)
  }
  return out
}

/** A CSS color as the app's theme writes them: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`. */
fun parseColor(value: String?, fallback: Int): Int {
  if (value == null) return fallback
  val text = value.trim()
  return try {
    when {
      text.startsWith("#") -> {
        val hex = text.substring(1)
        when (hex.length) {
          3 -> Color.parseColor("#" + hex.map { "$it$it" }.joinToString(""))
          6 -> Color.parseColor(text)
          8 -> {
            // CSS puts alpha last; Android first.
            val rgb = hex.substring(0, 6)
            Color.parseColor("#${hex.substring(6)}$rgb")
          }
          else -> fallback
        }
      }
      text.startsWith("rgb") -> {
        val parts = text.substringAfter("(").substringBefore(")").split(",", " ", "/")
          .map { it.trim() }.filter { it.isNotEmpty() }
        val r = parts[0].toFloat().toInt()
        val g = parts[1].toFloat().toInt()
        val b = parts[2].toFloat().toInt()
        val a = parts.getOrNull(3)?.let {
          if (it.endsWith("%")) it.dropLast(1).toFloat() / 100f else it.toFloat()
        } ?: 1f
        Color.argb((a * 255f).toInt().coerceIn(0, 255), r, g, b)
      }
      text == "transparent" -> Color.TRANSPARENT
      else -> Color.parseColor(text)
    }
  } catch (_: Exception) {
    fallback
  }
}

private fun textStyle(map: ReadableMap?, fallback: TextStyle): TextStyle {
  if (map == null) return fallback
  return TextStyle(
    map.num("size")?.toFloat() ?: fallback.size,
    map.num("lineHeight")?.toFloat() ?: fallback.lineHeight,
  )
}

fun decodeTheme(map: ReadableMap?): Theme {
  val d = Theme.DEFAULT
  if (map == null) return d
  val c = map.map("colors")
  fun color(key: String, fallback: Int) = parseColor(c?.str(key), fallback)
  val t = map.map("type")
  val m = map.map("metrics")
  fun metric(key: String, fallback: Float) = m?.num(key)?.toFloat() ?: fallback
  return Theme(
    background = color("background", d.background),
    // Optional: older JavaScript doesn't send it.
    backgroundElevated = color("backgroundElevated", color("background", d.background)),
    foreground = color("foreground", d.foreground),
    muted = color("muted", d.muted),
    subtle = color("subtle", d.subtle),
    separator = color("separator", d.separator),
    fill = color("fill", d.fill),
    accent = color("accent", d.accent),
    onAccent = color("onAccent", d.onAccent),
    bubbleIncoming = color("bubbleIncoming", d.bubbleIncoming),
    bubbleOutgoing = color("bubbleOutgoing", d.bubbleOutgoing),
    textIncoming = color("textIncoming", d.textIncoming),
    textOutgoing = color("textOutgoing", d.textOutgoing),
    destructive = color("destructive", d.destructive),
    highlight = color("highlight", d.highlight),
    monogramTop = color("monogramTop", d.monogramTop),
    monogramBottom = color("monogramBottom", d.monogramBottom),
    body = textStyle(t?.map("body"), d.body),
    name = textStyle(t?.map("name"), d.name),
    caption = textStyle(t?.map("caption"), d.caption),
    footnote = textStyle(t?.map("footnote"), d.footnote),
    jumbo = textStyle(t?.map("jumbo"), d.jumbo),
    bubbleRadius = metric("bubbleRadius", d.bubbleRadius),
    bubbleMaxWidthFraction = metric("bubbleMaxWidthFraction", d.bubbleMaxWidthFraction),
    avatarSize = metric("avatarSize", d.avatarSize),
    horizontalPadding = metric("horizontalPadding", d.horizontalPadding),
    runGap = metric("runGap", d.runGap),
    rowGap = metric("rowGap", d.rowGap),
  )
}

fun decodeBehavior(map: ReadableMap?): Behavior {
  val d = Behavior.DEFAULT
  if (map == null) return d
  return Behavior(
    moveMs = map.num("moveMs")?.toLong() ?: d.moveMs,
    fadeMs = map.num("fadeMs")?.toLong() ?: d.fadeMs,
    firehoseFrom = map.num("firehoseFrom")?.toInt() ?: d.firehoseFrom,
    firehoseUntil = map.num("firehoseUntil")?.toInt() ?: d.firehoseUntil,
    firehoseWindowMs = map.num("firehoseWindowMs")?.toLong() ?: d.firehoseWindowMs,
    loadAheadScreens = map.num("loadAheadScreens")?.toFloat() ?: d.loadAheadScreens,
    nearLatestPoints = map.num("nearLatestPoints")?.toFloat() ?: d.nearLatestPoints,
  )
}
