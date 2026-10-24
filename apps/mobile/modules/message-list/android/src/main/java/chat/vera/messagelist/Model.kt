package chat.vera.messagelist

// The contract's rows, blocks, theme, and behavior (see
// src/features/native-list/contract.ts), as Kotlin values. Data classes,
// so the list can tell a changed row from the same one by equality.

/** The contract this binary draws, reported as the module's `support`. */
const val CONTRACT_VERSION = 1
val ROW_KINDS = listOf("message", "header", "notice", "typing", "custom")
val BLOCK_TYPES = listOf("text", "media", "file", "linkCard", "quote", "deleted")
val FEATURES = listOf("benchFling", "lift", "liftHandoff")

data class Person(
  val id: String,
  val name: String,
  val avatarUrl: String?,
  val initials: String,
)

data class Span(
  val text: String,
  val style: String?,
  val url: String?,
  val accountId: String?,
)

data class Reaction(
  val key: String,
  /** Drawn as text; null for an image reaction (drawn by its label for now). */
  val emoji: String?,
  val imageUrl: String?,
  val label: String?,
  val count: Int,
  val mine: Boolean,
) {
  /** What it shows: the emoji, or an image reaction's label until images are drawn. */
  val shown: String get() = emoji ?: label ?: "?"
}

data class MediaItem(
  val id: String,
  val isVideo: Boolean,
  val url: String,
  val thumbnailUrl: String?,
  val localUrl: String?,
  val width: Int,
  val height: Int,
  val durationSeconds: Double?,
  val part: String,
  val reactions: List<Reaction>,
  val uploading: Boolean,
) {
  /** What the list draws: a local file while it uploads, else the poster or a smaller rendition. */
  val shownUrl: String
    get() = localUrl ?: thumbnailUrl ?: url
}

data class FooterLine(
  val kind: String,
  val text: String,
  val people: List<Person>,
)

sealed class Block {
  abstract val part: String?
}

data class TextBlock(val spans: List<Span>, val jumbo: Boolean, override val part: String?) : Block()

data class MediaBlock(val items: List<MediaItem>, override val part: String?) : Block()

data class FileBlock(
  val name: String,
  val sizeLabel: String,
  val url: String,
  override val part: String?,
) : Block()

data class LinkCardBlock(
  val url: String,
  val title: String?,
  val description: String?,
  val imageUrl: String?,
  val imageWidth: Int?,
  val imageHeight: Int?,
  val site: String,
  override val part: String?,
) : Block()

data class QuoteBlock(
  val author: Person,
  val text: String,
  val thumbnailUrl: String?,
  val messageId: String,
  override val part: String?,
) : Block()

data class DeletedBlock(val label: String, override val part: String?) : Block()

/** A block this binary doesn't know: its text in its place. */
data class UnknownBlock(val text: String, override val part: String?) : Block()

sealed class Row {
  abstract val id: String
}

data class MessageRow(
  override val id: String,
  val stacked: Boolean,
  val author: Person,
  val isOwn: Boolean,
  val showAuthor: Boolean,
  val startsGroup: Boolean,
  val endsGroup: Boolean,
  val sentAt: Double,
  val timeLabel: String,
  val blocks: List<Block>,
  val reactions: List<Reaction>,
  val footer: List<FooterLine>,
  val status: String?,
  val highlighted: Boolean,
  val arrived: Boolean,
  val accessibilityLabel: String,
) : Row()

/** `style`: "time" (bubbles), "day" (stacked), or "replies" (a thread's divider). */
data class HeaderRow(override val id: String, val style: String, val label: String) : Row()

data class NoticeRow(override val id: String, val spans: List<Span>) : Row()

data class TypingRow(
  override val id: String,
  val stacked: Boolean,
  val people: List<Person>,
  val label: String,
  /** Their photos beside it: groups and spaces, not one-on-one. Missing in older JavaScript: shown. */
  val showFaces: Boolean = true,
) : Row()

/** A custom row, or a kind this binary doesn't know: its `fallbackText`. */
data class FallbackRow(override val id: String, val text: String) : Row()

data class TextStyle(val size: Float, val lineHeight: Float)

data class Theme(
  val background: Int,
  /** Cards over the background (link previews). */
  val backgroundElevated: Int,
  val foreground: Int,
  val muted: Int,
  val subtle: Int,
  val separator: Int,
  val fill: Int,
  val accent: Int,
  val onAccent: Int,
  val bubbleIncoming: Int,
  val bubbleOutgoing: Int,
  val textIncoming: Int,
  val textOutgoing: Int,
  val destructive: Int,
  val highlight: Int,
  val monogramTop: Int,
  val monogramBottom: Int,
  val body: TextStyle,
  val name: TextStyle,
  val caption: TextStyle,
  val footnote: TextStyle,
  val jumbo: TextStyle,
  val bubbleRadius: Float,
  val bubbleMaxWidthFraction: Float,
  val avatarSize: Float,
  val horizontalPadding: Float,
  val runGap: Float,
  val rowGap: Float,
) {
  /** Stacked rows' names and cards' titles: a size between body and footnote. */
  val subhead: TextStyle
    get() = TextStyle(body.size - 2, body.lineHeight - 2)

  companion object {
    /** The app's light theme, until JavaScript sends one. */
    val DEFAULT =
      Theme(
        background = 0xFFFFFFFF.toInt(),
        backgroundElevated = 0xFFFFFFFF.toInt(),
        foreground = 0xFF000000.toInt(),
        muted = 0x993C3C43.toInt(),
        subtle = 0x4D3C3C43,
        separator = 0x4A3C3C43,
        fill = 0x1F767680,
        accent = 0xFF007AFF.toInt(),
        onAccent = 0xFFFFFFFF.toInt(),
        bubbleIncoming = 0xFFE9E9EB.toInt(),
        bubbleOutgoing = 0xFF007AFF.toInt(),
        textIncoming = 0xFF000000.toInt(),
        textOutgoing = 0xFFFFFFFF.toInt(),
        destructive = 0xFFFF3B30.toInt(),
        highlight = 0x2EFFCC00,
        monogramTop = 0xFFA6ABB8.toInt(),
        monogramBottom = 0xFF858994.toInt(),
        body = TextStyle(17f, 22f),
        name = TextStyle(12f, 16f),
        caption = TextStyle(12f, 16f),
        footnote = TextStyle(13f, 18f),
        jumbo = TextStyle(40f, 44f),
        bubbleRadius = 20f,
        bubbleMaxWidthFraction = 0.75f,
        avatarSize = 36f,
        horizontalPadding = 16f,
        runGap = 14f,
        rowGap = 4f,
      )
  }
}

data class Behavior(
  val moveMs: Long,
  val fadeMs: Long,
  val firehoseFrom: Int,
  val firehoseUntil: Int,
  val firehoseWindowMs: Long,
  val loadAheadScreens: Float,
  val nearLatestPoints: Float,
) {
  companion object {
    val DEFAULT = Behavior(420, 400, 8, 3, 2000, 10f, 80f)
  }
}
