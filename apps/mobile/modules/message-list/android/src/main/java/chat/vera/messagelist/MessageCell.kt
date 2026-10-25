package chat.vera.messagelist

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/** What every cell shares: units, photos, the carousels' pool, and the reveal. */
class CellEnv(
  val units: Units,
  val images: Images,
  val mediaPool: RecyclerView.RecycledViewPool,
) {
  var theme: Theme = Theme.DEFAULT

  /** How far the times are dragged in (bubbles), in pixels. */
  var reveal = 0f

  /** Rows whose highlight has shown: it fades once, not each time the row is drawn again. */
  val tinted = HashSet<String>()

  /** A deck brought another card to the front: its row's reactions show for it. */
  var onDeckChanged: ((MessageCell) -> Unit)? = null

  /** Where each carousel was left, and each deck's front photo, by row and block: kept as cells recycle. */
  val carouselOffsets = HashMap<String, Int>()
  val deckFronts = HashMap<String, Int>()
}

/** The shape of a block, for the cell's view type: cells of one shape recycle into each other. */
enum class Shape { TEXT, JUMBO, MEDIA_ONE, MEDIA_GROUP, FILE, LINK, QUOTE, DELETED, UNKNOWN }

fun shapeOf(block: Block): Shape =
  when (block) {
    is TextBlock -> if (block.jumbo) Shape.JUMBO else Shape.TEXT
    is MediaBlock -> if (block.items.size > 1) Shape.MEDIA_GROUP else Shape.MEDIA_ONE
    is FileBlock -> Shape.FILE
    is LinkCardBlock -> Shape.LINK
    is QuoteBlock -> Shape.QUOTE
    is DeletedBlock -> Shape.DELETED
    is UnknownBlock -> Shape.UNKNOWN
  }

data class Signature(val stacked: Boolean, val isOwn: Boolean, val shapes: List<Shape>)

/**
 * What a part's tapbacks show: for photos, the shown photo's own reactions
 * (a deck's front one, `front`), so tapping them acts on what's in view;
 * then the message's own reactions (`own`) if they sit on this part.
 */
internal fun tapbackReactions(block: Block, front: Int?, own: List<Reaction>): List<Reaction> {
  if (block !is MediaBlock) return own
  val item = block.items.getOrNull(front ?: 0) ?: block.items.firstOrNull()
  return (item?.reactions ?: emptyList()) + own
}

/** Every reaction a message shows: its own, and each photo's. */
internal fun allReactions(row: MessageRow): List<Reaction> =
  row.reactions + row.blocks.flatMap { block -> if (block is MediaBlock) block.items.flatMap { it.reactions } else emptyList() }

/**
 * Whether a change to a bubbles row opens or closes its room at the top:
 * its reactions changed (the message's own or a photo's, both drawn as
 * tapbacks over a part) and its lines under it didn't. The row's bottom
 * then stays put and only the rows above move, once.
 */
internal fun reactionsGrowAtTop(before: MessageRow?, row: MessageRow): Boolean =
  !row.stacked && before != null && before.id == row.id && allReactions(before) != allReactions(row) && before.footer == row.footer

/**
 * Whether a message can grow out of the typing bubble, as the React
 * Native list's `morphs()`: bubbles, and only text (no photos, quote, link
 * card, or jumbo emoji).
 */
internal fun morphs(row: MessageRow): Boolean =
  !row.stacked && row.blocks.isNotEmpty() && row.blocks.all { it is TextBlock && !it.jumbo }

fun signatureOf(row: MessageRow) = Signature(row.stacked, row.isOwn && !row.stacked, row.blocks.map(::shapeOf))

/**
 * A message: its sender's photo and name, its blocks top to bottom, its
 * reactions, and the lines under it, laid out by hand in one pass for
 * either layout:
 *
 * - Bubbles (iMessage): yours on the right, theirs on the left with the
 *   sender's name over a run and photo by its tail in groups; tapbacks over
 *   each part's top corner; times revealed by dragging the list left.
 * - Stacked (Slack): a photo, name, and time over a run, everything
 *   left-aligned, chips under the message.
 *
 * Its views are made once for its `Signature` and rebound as it recycles.
 */
@SuppressLint("ViewConstructor")
class MessageCell(context: Context, private val env: CellEnv, val signature: Signature) : ViewGroup(context) {
  private val units = env.units
  private val stacked = signature.stacked

  private val avatar = AvatarView(context, units)
  private val name = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.END
  }
  private val time = plainText(context).apply { isSingleLine = true }
  private val revealTime = plainText(context).apply { isSingleLine = true }

  /** Stacked rows' quote line, over the row. */
  private val stackedQuote: QuoteView?
  private val blockViews = ArrayList<View>()

  /** The block each view draws (stacked rows' quote isn't among them). */
  private val blockIndex = ArrayList<Int>()
  private val tapbacks = ArrayList<TapbacksView?>()
  private val partChips = ArrayList<ChipsView?>()
  private val rowChips: ChipsView?
  private val footers = ArrayList<FooterView>()

  private var row: MessageRow? = null
  private var pendingBind: Pair<MessageRow, Boolean>? = null
  var isLifted = false
    private set
  private val blockTops = IntArray(signature.shapes.size)
  private var blocksTop = 0
  private var blocksBottom = 0

  /**
   * Where a change to this row opens or closes its space: at its top
   * (tapbacks, in bubbles) or its bottom (chips and lines under it). The
   * item animator keeps that edge's content still as the row resizes.
   */
  var growsAtTop = false
    private set

  init {
    clipChildren = false
    clipToPadding = false
    setWillNotDraw(false)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    addView(avatar)
    addView(name)
    addView(time)
    if (!stacked) addView(revealTime)
    var quote: QuoteView? = null
    signature.shapes.forEachIndexed { index, shape ->
      if (stacked && shape == Shape.QUOTE && quote == null) {
        quote = QuoteView(context, units, env.images).also { addView(it) }
        return@forEachIndexed
      }
      val view: View = when (shape) {
        Shape.TEXT, Shape.DELETED, Shape.UNKNOWN ->
          if (stacked) plainText(context) else BubbleTextView(context, units)
        Shape.JUMBO -> plainText(context)
        Shape.MEDIA_ONE -> MediaView(context, units)
        Shape.MEDIA_GROUP ->
          if (stacked) CarouselView(context, units, env.images, env.mediaPool, env.carouselOffsets).also { strip -> strip.onOffset = { recede(it) } }
          else DeckView(context, units, env.images, env.deckFronts).also { deck -> deck.onCurrent = { env.onDeckChanged?.invoke(this) } }
        Shape.FILE -> FileCardView(context, units)
        Shape.LINK -> LinkCardView(context, units, env.images)
        Shape.QUOTE -> QuoteView(context, units, env.images)
      }
      blockViews.add(view)
      blockIndex.add(index)
      addView(view)
      tapbacks.add(if (stacked) null else TapbacksView(context, units).also { addView(it) })
      partChips.add(if (stacked && shape == Shape.MEDIA_ONE) ChipsView(context, units).also { addView(it) } else null)
    }
    stackedQuote = quote
    rowChips = if (stacked) ChipsView(context, units).also { addView(it) } else null
  }

  val rowId: String?
    get() = row?.id
  val landingBackground: Int
    get() = env.theme.background

  // MARK: Binding

  fun bind(row: MessageRow, animate: Boolean) {
    if (isLifted) {
      pendingBind = row to animate
      return
    }
    val before = this.row
    this.row = row
    val theme = env.theme
    growsAtTop = reactionsGrowAtTop(before, row)
    if (before?.id != row.id) {
      tintAnimator?.cancel()
      tint = 0f
    }
    // The message a search or notification opened on: tinted, fading after a moment.
    if (row.highlighted && env.tinted.add(row.id)) {
      tint = 1f
      tintAnimator = android.animation.ValueAnimator.ofFloat(1f, 0f).apply {
        startDelay = 800
        duration = 1600
        addUpdateListener {
          tint = it.animatedValue as Float
          invalidate()
        }
        start()
      }
    }
    pressTarget = Target("message", row.id, part = mainPart(row))
    holdTarget = HoldTarget(row.id, mainPart(row))
    contentDescription = row.accessibilityLabel

    val author = Target("author", row.id, accountId = row.author.id)
    avatar.bind(row.author, theme, if (stacked) theme.avatarSize else 28f, env.images)
    avatar.pressTarget = author
    name.pressTarget = author
    if (stacked) {
      name.style(units, theme.subhead, theme.foreground, Fonts.bold)
      time.style(units, theme.caption, theme.muted)
      time.text = row.timeLabel
      time.alpha = if (row.status == null) 1f else 0f
    } else {
      name.style(units, theme.name, theme.muted)
      revealTime.style(units, theme.caption, theme.muted)
      revealTime.text = row.timeLabel
    }
    name.text = row.author.name

    val maxWidth = contentMax()
    val reactionsAt = reactionsBlock(row)
    for ((slot, view) in blockViews.withIndex()) {
      val index = blockIndex[slot]
      val block = row.blocks.getOrNull(index) ?: continue
      bindBlock(row, index, block, view, maxWidth, index == tailBlock(row))
      val target = if (row.status == "sending") 0.5f else 1f
      view.animate().cancel()
      // Sent: fades up to full (RN's SENT_FADE_MS), instead of a "Delivered" label.
      if (animate && before?.status == "sending" && target == 1f) {
        view.alpha = 0.5f
        view.animate().alpha(1f).setDuration(300).setInterpolator(EASE_OUT).start()
      } else {
        view.alpha = target
      }
      tapbacks[slot]?.let { taps ->
        taps.incoming = !row.isOwn
        val reactions = blockReactions(row, block, view, index == reactionsAt)
        taps.bind(reactions, theme, animate)
        taps.visibility = if (taps.shownCount > 0 || animate) VISIBLE else GONE
        aimTapbacks(taps, row, block, view, reactions)
      }
      partChips[slot]?.let { chips ->
        val item = (block as? MediaBlock)?.items?.firstOrNull()
        chips.bind(item?.reactions ?: emptyList(), theme, row.id, item?.part, animate, index = 0)
      }
    }
    stackedQuote?.let { quote ->
      val block = row.blocks.firstOrNull { it is QuoteBlock } as? QuoteBlock
      if (block != null) {
        quote.curveFrom = units.px(theme.horizontalPadding + 18f)
        quote.bind(block, theme, true, 0)
        quote.pressTarget = Target("quote", row.id, part = block.part, messageId = block.messageId)
        quote.holdTarget = HoldTarget(row.id, block.part)
      }
    }
    rowChips?.bind(row.reactions, theme, row.id, mainPart(row), animate)

    val lines = row.footer.filter { !(stacked && it.kind == "edited" && hasText(row)) }
    while (footers.size < lines.size) footers.add(FooterView(context, units, env.images).also { addView(it) })
    footers.forEachIndexed { index, footer ->
      val line = lines.getOrNull(index)
      footer.visibility = if (line == null) GONE else VISIBLE
      if (line != null) footer.bind(line, theme, stacked, row.isOwn && !stacked, row.id)
    }
    applyReveal()
    requestLayout()
    invalidate()
  }

  /** The block that draws the tail at the end of a run: the last text, unless a link card follows. */
  private fun tailBlock(row: MessageRow): Int {
    if (!row.endsGroup || row.blocks.any { it is LinkCardBlock }) return -1
    return row.blocks.indexOfLast { it is TextBlock && !it.jumbo }
  }

  private fun hasText(row: MessageRow) = row.blocks.any { it is TextBlock && !it.jumbo }

  private fun mainPart(row: MessageRow): String? =
    row.blocks.firstOrNull { it is TextBlock }?.part ?: row.blocks.firstOrNull()?.part

  private fun bodyChipsSlot(row: MessageRow): Int =
    blockIndex.indexOfFirst { row.blocks.getOrNull(it) is TextBlock }

  private fun partOf(block: Block, view: View): String? =
    when (block) {
      is MediaBlock -> if (view is DeckView) view.currentItem?.part else block.items.firstOrNull()?.part
      else -> block.part
    }

  /** The media item a part's tapbacks sit on, for `index`: a deck's front photo, or a lone photo. */
  private fun indexOf(block: Block, view: View): Int? =
    when {
      block !is MediaBlock -> null
      view is DeckView -> view.current
      else -> 0
    }

  /**
   * A tap on tapbacks is on their front (newest) reaction; a hold too, which
   * says so (`reactionKey`) and reports the part they sit on.
   */
  private fun aimTapbacks(taps: TapbacksView, row: MessageRow, block: Block, view: View, reactions: List<Reaction>) {
    val front = reactions.lastOrNull()
    val part = partOf(block, view)
    val index = indexOf(block, view)
    taps.pressTarget = Target("reaction", row.id, part = part, index = index, reactionKey = front?.key)
    taps.holdTarget = front?.let { HoldTarget(row.id, part, index, reactionKey = it.key) }
  }

  /** Which block the message's own reactions sit on: its text, or else its first part. */
  private fun reactionsBlock(row: MessageRow): Int {
    val text = row.blocks.indexOfFirst { it is TextBlock || it is DeletedBlock || it is UnknownBlock }
    return if (text >= 0) text else 0
  }

  private fun blockReactions(row: MessageRow, block: Block, view: View, own: Boolean): List<Reaction> =
    tapbackReactions(block, (view as? DeckView)?.current, if (own) row.reactions else emptyList())

  /** The deck brought another card forward: show its reactions. */
  fun deckChanged() {
    val row = row ?: return
    for ((slot, view) in blockViews.withIndex()) {
      if (view !is DeckView) continue
      val block = row.blocks.getOrNull(blockIndex[slot]) ?: continue
      tapbacks[slot]?.let { taps ->
        val reactions = blockReactions(row, block, view, blockIndex[slot] == reactionsBlock(row))
        taps.bind(reactions, env.theme, animate = true)
        taps.visibility = VISIBLE
        aimTapbacks(taps, row, block, view, reactions)
      }
    }
    requestLayout()
  }

  /** Where stacked rows' text starts: past the avatar. */
  private fun stackedColumn(): Int = units.px(env.theme.horizontalPadding + env.theme.avatarSize + 12f)

  private fun contentMax(): Int {
    val theme = env.theme
    val width = if (this.width > 0) this.width else (parent as? View)?.width ?: resources.displayMetrics.widthPixels
    val inner = width - units.px(theme.horizontalPadding) * 2
    if (stacked) return inner - units.px(theme.avatarSize + 12f)
    return (inner * theme.bubbleMaxWidthFraction).toInt()
  }

  private fun bindBlock(row: MessageRow, index: Int, block: Block, view: View, maxWidth: Int, last: Boolean) {
    val theme = env.theme
    view.holdTarget = HoldTarget(row.id, block.part)
    view.pressTarget = Target("message", row.id, part = block.part)
    when (block) {
      is TextBlock -> {
        val text = view as TextView
        if (block.jumbo) {
          text.style(units, theme.jumbo, theme.foreground)
          text.text = styledText(block.spans, theme, false, row.id, block.part)
        } else if (view is BubbleTextView) {
          val own = row.isOwn
          view.style(units, theme.body, if (own) theme.textOutgoing else theme.textIncoming)
          view.bindBubble(if (own) theme.bubbleOutgoing else theme.bubbleIncoming, last, own, theme.bubbleRadius)
          view.text = styledText(block.spans, theme, own, row.id, block.part)
        } else {
          text.style(units, theme.body, theme.foreground)
          val styled = styledText(block.spans, theme, false, row.id, block.part)
          val edited = row.footer.firstOrNull { it.kind == "edited" }
          text.text = if (edited != null && index == row.blocks.indexOfLast { it is TextBlock }) {
            SpannableStringBuilder(styled).apply {
              val start = length
              append(" (").append(edited.text.lowercase()).append(")")
              setSpan(ForegroundColorSpan(theme.muted), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
              setSpan(android.text.style.AbsoluteSizeSpan(units.sp(theme.caption.size).toInt()), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
          } else styled
        }
      }
      is DeletedBlock, is UnknownBlock -> {
        val label = if (block is DeletedBlock) block.label else (block as UnknownBlock).text
        val text = view as TextView
        text.style(units, theme.body, if (block is DeletedBlock) theme.muted else theme.foreground)
        text.setTypeface(Typeface.DEFAULT, if (block is DeletedBlock) Typeface.ITALIC else Typeface.NORMAL)
        text.setTag(R.id.message_list_style, null)
        text.text = label
        if (view is BubbleTextView) {
          if (block is DeletedBlock) view.bindBubble(theme.separator, false, row.isOwn, theme.bubbleRadius, outlined = true)
          else view.bindBubble(theme.bubbleIncoming, last, row.isOwn, theme.bubbleRadius)
        }
      }
      is MediaBlock -> {
        when (view) {
          is MediaView -> {
            val item = block.items.first()
            val width = minOf(units.px(240f), maxWidth)
            val height = if (item.width > 0 && item.height > 0) minOf(units.px(300f), width * item.height / item.width) else width
            view.setSize(width, height)
            view.bind(item, theme, env.images)
            view.pressTarget = Target("media", row.id, part = item.part, index = 0)
            view.holdTarget = HoldTarget(row.id, item.part, 0)
          }
          is CarouselView -> view.bind(row.id, "${row.id}#$index", block.items, theme, stackedColumn(), units.px(theme.horizontalPadding), animate = false)
          is DeckView -> view.bind(row.id, "${row.id}#$index", block.items, theme, maxWidth)
        }
      }
      is FileBlock -> {
        (view as FileCardView).bind(block, theme, maxWidth)
        view.pressTarget = Target("file", row.id, part = block.part, url = block.url)
      }
      is LinkCardBlock -> {
        (view as LinkCardView).bind(block, theme, maxWidth)
        view.pressTarget = Target("linkCard", row.id, part = block.part, url = block.url)
      }
      is QuoteBlock -> {
        (view as QuoteView).bind(block, theme, false, maxWidth)
        view.pressTarget = Target("quote", row.id, part = block.part, messageId = block.messageId)
      }
    }
  }

  /** Reactions changed with an animation: the carousel's chips pop too. */
  fun bindAnimated(row: MessageRow) {
    bind(row, animate = true)
    for ((slot, view) in blockViews.withIndex()) {
      val block = row.blocks.getOrNull(blockIndex[slot]) as? MediaBlock ?: continue
      if (view is CarouselView) {
        view.bind(row.id, "${row.id}#${blockIndex[slot]}", block.items, env.theme, stackedColumn(), units.px(env.theme.horizontalPadding), animate = true)
      }
    }
  }

  // MARK: Layout

  private val named: Boolean
    get() = row?.let { !stacked && it.showAuthor && !it.isOwn && it.startsGroup } == true

  private val avatarColumn: Boolean
    get() = row?.let { !stacked && it.showAuthor && !it.isOwn } == true

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) = timed({ "measure ${row?.id}" }) { measureNow(widthMeasureSpec) }

  private fun measureNow(widthMeasureSpec: Int) {
    if (isLifted) {
      setMeasuredDimension(measuredWidth, measuredHeight)
      return
    }
    val row = row
    val width = MeasureSpec.getSize(widthMeasureSpec)
    if (row == null) {
      setMeasuredDimension(width, 0)
      return
    }
    if (stacked) measureStacked(row, width) else measureBubbles(row, width)
  }

  private fun unspecified() = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)

  private fun atMost(px: Int) = MeasureSpec.makeMeasureSpec(maxOf(0, px), MeasureSpec.AT_MOST)

  private fun measureBubbles(row: MessageRow, width: Int) {
    val theme = env.theme
    val hpad = units.px(theme.horizontalPadding)
    val inner = width - hpad * 2
    val column = if (avatarColumn) units.px(28f + 10f) else 0
    val max = minOf((inner * theme.bubbleMaxWidthFraction).toInt(), inner - column)
    var y = units.px(if (row.startsGroup) theme.runGap else theme.rowGap)
    if (named) {
      name.measure(atMost(max - units.px(24f)), unspecified())
      y += units.px(16f + 6f)
    } else {
      name.measure(atMost(0), unspecified())
    }
    blocksTop = y
    val space = units.px(TapbacksView.SPACE)
    val reply = replyIndent(row)
    for ((slot, view) in blockViews.withIndex()) {
      val taps = tapbacks[slot]
      // Room only for tapbacks that stay: one shrinking away gives its room back as it goes.
      val hasTaps = taps != null && taps.shownCount > 0
      view.measure(atMost(max - if (slot > 0) reply else 0), unspecified())
      taps?.measure(unspecified(), unspecified())
      y += when {
        // Beside the name when they clear it, else over the bubble under it.
        slot == 0 && hasTaps -> if (named && tapbacksClearName(view, taps!!)) maxOf(0, space - units.px(22f)) else space
        slot == 0 -> 0
        hasTaps -> maxOf(units.px(4f), space)
        else -> units.px(4f)
      }
      if (slot == 0) blocksTop = y
      blockTops[slot] = y
      y += view.measuredHeight
    }
    blocksBottom = y
    for (footer in footers) {
      if (footer.visibility != VISIBLE) continue
      footer.measure(atMost(max), unspecified())
      y += units.px(2f) + footer.measuredHeight
    }
    avatar.measure(unspecified(), unspecified())
    revealTime.measure(unspecified(), unspecified())
    time.measure(atMost(0), unspecified())
    setMeasuredDimension(width, y)
  }

  /** Whether the first part's tapbacks, fanned over its corner, stay 6 pt clear of the name. */
  private fun tapbacksClearName(view: View, taps: TapbacksView): Boolean {
    val reach = units.px(TapbacksView.SIZE / 2f - TapbacksView.CENTER_INSET)
    val fanLeft = view.measuredWidth + reach - taps.contentWidth()
    return fanLeft >= units.px(12f + 6f) + name.measuredWidth
  }

  /** How far a reply's parts sit in from its quote (bubbles), for the curve between them. */
  private fun replyIndent(row: MessageRow): Int =
    if (!stacked && row.blocks.firstOrNull() is QuoteBlock && row.blocks.size > 1) units.px(REPLY_INDENT) else 0

  private fun measureStacked(row: MessageRow, width: Int) {
    val theme = env.theme
    val hpad = units.px(theme.horizontalPadding)
    val columnX = hpad + units.px(theme.avatarSize + 12f)
    val columnWidth = width - columnX - hpad
    var y = 0
    val quote = stackedQuote
    if (quote != null) {
      quote.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), unspecified())
      y += quote.measuredHeight + units.px(6f)
    } else {
      y += units.px(if (row.startsGroup) 20f else 6f)
    }
    avatar.measure(unspecified(), unspecified())
    if (row.startsGroup) {
      time.measure(unspecified(), unspecified())
      name.measure(atMost(columnWidth - time.measuredWidth - units.px(8f)), unspecified())
      y += units.px(20f + 4f)
    } else {
      name.measure(atMost(0), unspecified())
      time.measure(atMost(0), unspecified())
    }
    blocksTop = y
    val chipsAt = bodyChipsSlot(row)
    rowChips?.measure(atMost(columnWidth), unspecified())
    for ((slot, view) in blockViews.withIndex()) {
      if (slot > 0) y += units.px(4f)
      blockTops[slot] = y
      if (view is CarouselView) {
        // Edge to edge: the whole row, with the column as its inset.
        view.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), unspecified())
      } else {
        view.measure(atMost(columnWidth), unspecified())
      }
      y += view.measuredHeight
      if (slot == chipsAt) y += rowChips?.measuredHeight ?: 0
      partChips[slot]?.let { chips ->
        chips.measure(atMost(columnWidth), unspecified())
        y += chips.measuredHeight
      }
    }
    blocksBottom = y
    for (footer in footers) {
      if (footer.visibility != VISIBLE) continue
      footer.measure(atMost(columnWidth), unspecified())
      y += footer.measuredHeight
    }
    if (chipsAt < 0) y += rowChips?.measuredHeight ?: 0
    setMeasuredDimension(width, y)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    if (isLifted) return
    val row = row ?: return
    if (stacked) layoutStacked(row, r - l) else layoutBubbles(row, r - l)
    applyReveal()
  }

  private fun place(view: View, x: Int, y: Int) {
    view.layout(x, y, x + view.measuredWidth, y + view.measuredHeight)
  }

  private fun layoutBubbles(row: MessageRow, width: Int) {
    val theme = env.theme
    val hpad = units.px(theme.horizontalPadding)
    val columnLeft = hpad + if (avatarColumn) units.px(28f + 10f) else 0
    val right = width - hpad
    if (named) {
      name.visibility = VISIBLE
      place(name, columnLeft + units.px(12f), units.px(if (row.startsGroup) theme.runGap else theme.rowGap))
    } else {
      name.visibility = GONE
    }
    time.visibility = GONE
    val reply = replyIndent(row)
    for ((slot, view) in blockViews.withIndex()) {
      val indent = if (slot > 0) reply else 0
      val x = if (row.isOwn) right - indent - view.measuredWidth else columnLeft + indent
      place(view, x, blockTops[slot])
      tapbacks[slot]?.let { taps ->
        if (taps.visibility != VISIBLE) return@let
        val reach = units.px(TapbacksView.SIZE / 2f - TapbacksView.CENTER_INSET)
        val tx = if (row.isOwn) view.left - reach else view.right + reach - taps.measuredWidth
        // A deck's go on its front photo's corner: below the room for the
        // cards behind, and lower still for a photo shorter than the pile.
        val anchor = blockTops[slot] + if (view is DeckView) view.frontTop else 0
        place(taps, tx, anchor - units.px(TapbacksView.SPACE))
      }
    }
    var y = blocksBottom
    for (footer in footers) {
      if (footer.visibility != VISIBLE) continue
      y += units.px(2f)
      val x = if (row.isOwn) right - footer.measuredWidth else columnLeft
      place(footer, x, y)
      y += footer.measuredHeight
    }
    if (avatarColumn && row.endsGroup) {
      avatar.visibility = VISIBLE
      place(avatar, hpad, blocksBottom - avatar.measuredHeight)
    } else {
      avatar.visibility = GONE
    }
    val middle = (blocksTop + blocksBottom) / 2
    place(revealTime, width - units.px(12f) - revealTime.measuredWidth, middle - revealTime.measuredHeight / 2)
  }

  private fun layoutStacked(row: MessageRow, width: Int) {
    val theme = env.theme
    val hpad = units.px(theme.horizontalPadding)
    val columnX = hpad + units.px(theme.avatarSize + 12f)
    stackedQuote?.let { place(it, 0, 0) }
    val top = blocksTop - if (row.startsGroup) units.px(24f) else 0
    if (row.startsGroup) {
      avatar.visibility = VISIBLE
      name.visibility = VISIBLE
      time.visibility = VISIBLE
      place(avatar, hpad, top)
      val line = units.px(20f)
      val nameY = top + (line - name.measuredHeight) / 2
      place(name, columnX, nameY)
      // On the name's baseline.
      val baseline = nameY + name.baseline
      place(time, columnX + name.measuredWidth + units.px(8f), baseline - time.baseline)
    } else {
      avatar.visibility = GONE
      name.visibility = GONE
      time.visibility = GONE
    }
    var y = blocksTop
    val chipsAt = bodyChipsSlot(row)
    recedeTo = 1f
    var strip: CarouselView? = null
    for ((slot, view) in blockViews.withIndex()) {
      place(view, if (view is CarouselView) 0 else columnX, blockTops[slot])
      y = blockTops[slot] + view.measuredHeight
      if (slot == chipsAt) rowChips?.let { chips ->
        place(chips, columnX, y)
        y += chips.measuredHeight
      }
      partChips[slot]?.let { chips ->
        place(chips, columnX, y)
        y += chips.measuredHeight
      }
      // Photos passing the avatar: it shrinks toward its top, to clear them.
      if (view is CarouselView && row.startsGroup && strip == null && blockTops[slot] < top + avatar.measuredHeight) {
        strip = view
        recedeTo = ((blockTops[slot] - top - units.px(2f)).toFloat() / avatar.measuredHeight).coerceIn(0.4f, 1f)
      }
    }
    recede(strip?.let { it.offset() ?: it.restoredOffset } ?: 0)
    for (footer in footers) {
      if (footer.visibility != VISIBLE) continue
      place(footer, columnX, y)
      y += footer.measuredHeight
    }
    if (chipsAt < 0) rowChips?.let { place(it, columnX, y) }
  }

  // MARK: Revealing times

  /** Slides your bubbles left and brings every time in from the right edge as the list is dragged. */
  fun applyReveal() {
    if (isLifted) return
    if (stacked) return
    val row = row ?: return
    val reveal = env.reveal
    val full = units.pxf(REVEAL_WIDTH)
    revealTime.translationX = full - reveal
    revealTime.alpha = (reveal / full).coerceIn(0f, 1f)
    val slide = if (row.isOwn) -reveal else 0f
    for (view in blockViews) view.translationX = slide
    for (taps in tapbacks) taps?.translationX = slide
    for (footer in footers) footer.translationX = slide
    if (row.isOwn && replyIndent(row) > 0) invalidate()
  }

  // MARK: The avatar as photos pass

  /** How small the avatar gets as a carousel passes under it; 1 when none does. */
  private var recedeTo = 1f

  /**
   * At rest the avatar is as it is. As the strip under it scrolls, it
   * shrinks toward its top center, eased over its own width and the gap,
   * until its bottom clears the photos. Scrolling back reverses it.
   */
  private fun recede(offset: Int) {
    val scale = if (recedeTo >= 1f) 1f
    else {
      val progress = (offset / units.pxf(env.theme.avatarSize + 12f)).coerceIn(0f, 1f)
      1f - (1f - recedeTo) * EASE.getInterpolation(progress)
    }
    if (avatar.scaleX == scale && avatar.pivotY == 0f) return
    avatar.pivotX = avatar.measuredWidth / 2f
    avatar.pivotY = 0f
    avatar.scaleX = scale
    avatar.scaleY = scale
  }

  // MARK: Holding

  /** The part on this line, including whitespace beside stacked text. */
  fun heldPart(y: Float): View? = blockViews.minByOrNull {
    when {
      y < it.top -> it.top - y
      y > it.bottom -> y - it.bottom
      else -> 0f
    }
  }

  fun liftPieces(part: String?, index: Int?): LiftPieces? {
    val row = row ?: return null
    val slot = liftBlockSlot(row.blocks, blockIndex, part) ?: return null
    val view = blockViews.getOrNull(slot) ?: return null
    // A carousel lifts only the held media tile, not the whole lane; a deck only its front card.
    val held = when (view) {
      is CarouselView -> view.heldMedia(part, index) ?: return null
      is DeckView -> view.frontCard
      else -> view
    }
    // Tapbacks never lift: they hide while it's up (the menu shows its own), as React Native's do.
    val pieces = mutableListOf(held)
    val plain = held is TextView && held !is BubbleTextView
    return LiftPieces(holdRect(held), pieces, if (plain) env.theme.backgroundElevated else null)
  }

  fun beginLift() {
    isLifted = true
    for (taps in tapbacks) taps?.let {
      it.animate().cancel()
      it.alpha = 0f
    }
  }

  fun endLift() {
    isLifted = false
    // Back in place: the tapbacks fade back in (React Native's RETURN_MS).
    for (taps in tapbacks) taps?.animate()?.alpha(1f)?.setDuration(TAPBACKS_RETURN_MS)?.start()
    val pending = pendingBind
    pendingBind = null
    pending?.let { bind(it.first, it.second) }
    requestLayout()
  }

  /** Where a hold lifts from, in this cell: the held part, or for the row, its parts together. */
  fun holdRect(view: View?): Rect {
    if (view != null && view !== this) {
      val out = Rect()
      view.getDrawingRect(out)
      offsetDescendantRectToMyCoords(view, out)
      out.offset(view.translationX.toInt(), view.translationY.toInt())
      return out
    }
    val out = Rect()
    for (block in blockViews) {
      val rect = Rect(block.left, block.top, block.right, block.bottom)
      rect.offset(block.translationX.toInt(), 0)
      if (out.isEmpty) out.set(rect) else out.union(rect)
    }
    if (stacked && row?.startsGroup == true) out.union(avatar.left, avatar.top, out.right, out.bottom)
    if (out.isEmpty) out.set(0, 0, width, height)
    return out
  }

  // MARK: Accessibility

  /** What TalkBack can do on this message besides read it: its links, media, and reactions. */
  fun accessibilityTargets(): List<Pair<String, Target>> {
    val row = row ?: return emptyList()
    val out = ArrayList<Pair<String, Target>>()
    for (block in row.blocks) {
      when (block) {
        is TextBlock -> for (span in block.spans) {
          if (span.style == "link") out.add("Open ${span.text}" to Target("link", row.id, part = block.part, url = span.url ?: span.text))
          if (span.style == "mention") out.add(span.text to Target("mention", row.id, part = block.part, accountId = span.accountId))
        }
        is MediaBlock -> block.items.forEachIndexed { index, item ->
          val label = if (item.isVideo) "Play video" else "View photo"
          out.add((if (block.items.size > 1) "$label ${index + 1} of ${block.items.size}" else label) to Target("media", row.id, part = item.part, index = index))
          for (reaction in item.reactions) out.add("${reaction.shown} ${reaction.count}" to Target("reaction", row.id, part = item.part, reactionKey = reaction.key))
        }
        is LinkCardBlock -> out.add("Open ${block.title ?: block.site}" to Target("linkCard", row.id, part = block.part, url = block.url))
        is FileBlock -> out.add("Open ${block.name}" to Target("file", row.id, part = block.part, url = block.url))
        is QuoteBlock -> out.add("Open the message from ${block.author.name}" to Target("quote", row.id, part = block.part, messageId = block.messageId))
        else -> Unit
      }
    }
    for (reaction in row.reactions) out.add("${reaction.shown} ${reaction.count}" to Target("reaction", row.id, part = mainPart(row), reactionKey = reaction.key))
    for (line in row.footer) {
      if (line.kind == "replies") out.add(line.text to Target("replies", row.id))
      if (line.kind == "notSent") out.add(line.text to Target("notSent", row.id))
    }
    if (row.showAuthor && !row.isOwn) out.add(row.author.name to Target("author", row.id, accountId = row.author.id))
    return out
  }

  private var tint = 0f
  private var tintAnimator: android.animation.ValueAnimator? = null

  private val curvePaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    style = android.graphics.Paint.Style.STROKE
  }
  private val curve = android.graphics.Path()

  override fun onDraw(canvas: Canvas) {
    if (tint > 0f) canvas.drawColor(withAlpha(env.theme.highlight, tint))
    drawReplyCurve(canvas)
  }

  /** The curve from under a reply's quote down into its bubble, in the reply's indent. */
  private fun drawReplyCurve(canvas: Canvas) {
    val row = row ?: return
    if (replyIndent(row) == 0 || blockViews.size < 2) return
    val quote = blockViews[0]
    val body = blockViews[1]
    curvePaint.color = env.theme.separator
    curvePaint.strokeWidth = units.pxf(2f)
    val hpad = units.px(env.theme.horizontalPadding)
    val edge = if (row.isOwn) (width - hpad).toFloat() else (hpad + if (avatarColumn) units.px(28f + 10f) else 0).toFloat()
    val sign = if (row.isOwn) -1f else 1f
    val x = edge + sign * units.pxf(13f)
    val end = edge + sign * units.pxf(19f)
    val top = quote.bottom.toFloat()
    val bottom = body.top + units.pxf(18f)
    val r = units.pxf(6f)
    curve.reset()
    curve.moveTo(x, top)
    curve.lineTo(x, bottom - r)
    curve.quadTo(x, bottom, x + sign * r, bottom)
    curve.lineTo(end, bottom)
    canvas.save()
    if (row.isOwn) canvas.translate(-env.reveal, 0f)
    canvas.drawPath(curve, curvePaint)
    canvas.restore()
  }

  /** Grows its last bubble out of the typing bubble it replaces, its text and name fading in. */
  fun growFromTyping(ms: Long) {
    val bubble = blockViews.lastOrNull() as? BubbleTextView ?: return
    bubble.grow(units.pxf(60f), units.pxf(38f), ms, env.theme.muted)
    if (name.visibility == VISIBLE) {
      name.alpha = 0f
      name.animate().alpha(1f).setDuration(ms).setInterpolator(EASE).start()
    }
  }

  companion object {
    /** How far a drag slides your bubbles over to show times. */
    const val REVEAL_WIDTH = 72f

    /** How far a bubble reply sits in from its quote (RN's `REPLY_INDENT`). */
    const val REPLY_INDENT = 22f

    /** How long tapbacks take to fade back in after the menu closes. */
    const val TAPBACKS_RETURN_MS = 260L
  }
}

/**
 * A time header (bubbles), a day separator with faint rules (stacked), or
 * a thread's divider under its original: the count at the start, then a
 * hairline to the edge, as Slack draws it.
 */
class HeaderCell(context: Context, private val env: CellEnv) : ViewGroup(context) {
  private val units = env.units
  private val label = plainText(context).apply { centered() }
  private val rule = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
  private var day = false
  private var replies = false

  init {
    setWillNotDraw(false)
    addView(label)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
  }

  fun bind(row: HeaderRow) {
    val theme = env.theme
    day = row.style == "day"
    replies = row.style == "replies"
    if (replies) {
      label.style(units, theme.footnote, theme.muted, Fonts.semibold)
      label.text = row.label
      contentDescription = row.label
      rule.color = theme.separator
      requestLayout()
      invalidate()
      return
    }
    label.style(units, theme.caption, theme.muted)
    label.text = if (day) {
      SpannableStringBuilder(row.label).apply { setSpan(WeightSpan(Fonts.semibold), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
    } else timeHeader(row.label)
    contentDescription = row.label
    rule.color = theme.separator
    requestLayout()
    invalidate()
  }

  /** "Today 9:41 AM": the day in bold, as iMessage has it. */
  private fun timeHeader(label: String): CharSequence {
    val match = TIME.find(label) ?: return label
    if (match.range.first == 0) return label
    return SpannableStringBuilder(label).apply {
      setSpan(WeightSpan(Fonts.semibold), 0, match.range.first, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    label.measure(MeasureSpec.makeMeasureSpec(width - units.px(64f), MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    // RN's RepliesDivider: pt-5 pb-1; DaySeparator: pt-7 pb-2; time: py-3.
    val pad = when {
      replies -> units.px(20f + 4f)
      day -> units.px(28f) + units.px(8f)
      else -> units.px(24f)
    }
    setMeasuredDimension(width, label.measuredHeight + pad)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val top = when {
      replies -> units.px(20f)
      day -> units.px(28f)
      else -> units.px(12f)
    }
    val x = if (replies) units.px(env.theme.horizontalPadding) else (r - l - label.measuredWidth) / 2
    label.layout(x, top, x + label.measuredWidth, top + label.measuredHeight)
  }

  override fun onDraw(canvas: Canvas) {
    if (replies) {
      val y = label.top + label.height / 2f
      rule.shader = null
      rule.strokeWidth = 1f
      canvas.drawLine(label.right + units.pxf(12f), y, width - units.pxf(env.theme.horizontalPadding), y, rule)
      return
    }
    if (!day) return
    // Hairlines either side of the text, fading out toward the edges.
    val y = label.top + label.height / 2f
    val gap = units.pxf(12f)
    val hpad = units.pxf(env.theme.horizontalPadding)
    val peak = withAlpha(rule.color, 0.6f)
    val clear = withAlpha(rule.color, 0f)
    rule.strokeWidth = maxOf(1f, units.pxf(0.5f))
    rule.shader = android.graphics.LinearGradient(hpad, y, label.left - gap, y, clear, peak, android.graphics.Shader.TileMode.CLAMP)
    canvas.drawLine(hpad, y, label.left - gap, y, rule)
    rule.shader = android.graphics.LinearGradient(label.right + gap, y, width - hpad, y, peak, clear, android.graphics.Shader.TileMode.CLAMP)
    canvas.drawLine(label.right + gap, y, width - hpad, y, rule)
    rule.shader = null
  }
}

/** The time in a header's label, after the day. */
private val TIME = Regex("\\d{1,2}[:.]\\d{2}")

/** "Leo joined the conversation", centered between messages. Also draws rows this binary can't. */
class NoticeCell(context: Context, private val env: CellEnv) : ViewGroup(context) {
  private val units = env.units
  private val label = plainText(context).apply { centered() }
  private var top = 12f

  init {
    addView(label)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
  }

  fun bind(text: CharSequence, stacked: Boolean, italic: Boolean = false) {
    val theme = env.theme
    label.style(units, theme.caption, theme.muted)
    if (italic) label.setTypeface(Typeface.DEFAULT, Typeface.ITALIC)
    label.text = text
    contentDescription = text
    top = if (stacked) 20f else 12f
    requestLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    label.measure(MeasureSpec.makeMeasureSpec(width - units.px(96f), MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    setMeasuredDimension(width, label.measuredHeight + units.px(top) + units.px(4f))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val x = (r - l - label.measuredWidth) / 2
    val y = units.px(top)
    label.layout(x, y, x + label.measuredWidth, y + label.measuredHeight)
  }
}

/**
 * Who's typing, under the newest message. Bubbles: their photos and a
 * bubble of dots where their next message will be. Stacked: small photos,
 * "Maya is typing", and dots, in a line.
 */
class TypingCell(context: Context, private val env: CellEnv) : ViewGroup(context) {
  private val units = env.units
  private val faces = FacesView(context, units)
  private val bubble = object : View(context) {
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    val path = android.graphics.Path()
    override fun onDraw(canvas: Canvas) {
      BubbleShape.path(path, width.toFloat(), height - units.pxf(BubbleShape.TAIL_DROP), env.theme.bubbleRadius, true, false, units.density)
      canvas.drawPath(path, paint)
    }
  }
  private val dots = DotsView(context, units)
  private val label = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.END
  }
  private var stacked = false
  private var people = emptyList<String>()
  private var shifting = false
  private var showFaces = true

  init {
    // The faces' rings reach past the bottom, where the message's avatar ends.
    clipChildren = false
    addView(faces)
    addView(bubble)
    addView(dots)
    addView(label)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
  }

  fun bind(row: TypingRow) {
    val theme = env.theme
    val nextPeople = row.people.map { it.id }
    val changed = people.isNotEmpty() && people != nextPeople && stacked == row.stacked
    people = nextPeople
    shifting = changed
    stacked = row.stacked
    showFaces = row.showFaces
    contentDescription = row.label
    // One-on-one: no photos, only who's typing (they still say whose message grows out of it).
    val shownPeople = if (showFaces) row.people else emptyList()
    if (stacked) {
      faces.bind(shownPeople, theme, env.images, 18f, 4f, 1.5f, 3, changed, overflow = true)
      dots.bind(theme.muted, 4f, 2f)
      label.style(units, theme.footnote, theme.muted)
      if (changed && label.text.toString() != row.label) {
        val previous = plainText(context).apply {
          style(units, theme.footnote, theme.muted)
          text = label.text
          measure(MeasureSpec.makeMeasureSpec(label.width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(label.height, MeasureSpec.EXACTLY))
          layout(label.left, label.top, label.right, label.bottom)
        }
        overlay.add(previous)
        previous.animate().alpha(0f).setDuration(154).withEndAction { overlay.remove(previous) }.start()
        label.alpha = 0f
        label.animate().alpha(1f).setDuration(220).start()
      }
      label.text = row.label
      label.visibility = VISIBLE
      bubble.visibility = GONE
    } else {
      faces.bind(shownPeople, theme, env.images, 28f, 6f, BUBBLE_RING, 3, changed, overflow = true)
      dots.bind(theme.muted, 8f, 4f)
      bubble.paint.color = theme.bubbleIncoming
      bubble.visibility = VISIBLE
      bubble.invalidate()
      label.visibility = GONE
    }
    requestLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    faces.measure(0, 0)
    dots.measure(0, 0)
    if (stacked) {
      val used = units.px(32f) + faces.measuredWidth + dots.measuredWidth + units.px(16f)
      label.measure(MeasureSpec.makeMeasureSpec(maxOf(0, width - used), MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
      setMeasuredDimension(width, units.px(10f + 20f + 2f))
    } else {
      bubble.measure(
        MeasureSpec.makeMeasureSpec(units.px(60f), MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(units.px(38f + BubbleShape.TAIL_DROP), MeasureSpec.EXACTLY),
      )
      setMeasuredDimension(width, units.px(14f) + bubble.measuredHeight)
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val hpad = units.px(env.theme.horizontalPadding)
    val positions = if (shifting) listOf(label, dots, bubble).associateWith { it.x } else emptyMap()
    fun shifted() {
      for ((view, x) in positions) {
        view.translationX = x - view.left
        view.animate().translationX(0f).setDuration(220).setInterpolator(EASE).start()
      }
      shifting = false
    }
    if (stacked) {
      val top = units.px(10f)
      val line = units.px(20f)
      // Without photos, the label starts where the messages' text does.
      var x = if (faces.measuredWidth > 0) hpad else hpad + units.px(env.theme.avatarSize + 12f)
      for (view in listOf(faces, label, dots)) {
        if (view.measuredWidth == 0) continue
        val y = top + (line - view.measuredHeight) / 2
        view.layout(x, y, x + view.measuredWidth, y + view.measuredHeight)
        x += view.measuredWidth + units.px(8f)
      }
      shifted()
      return
    }
    val bottom = measuredHeight
    var x = hpad
    if (faces.measuredWidth > 0) {
      // Each photo where the message's avatar will be: its edge at the
      // margin and its bottom at the tail's, the ring around it outside.
      // The bubble then starts where the message's bubble does.
      val ring = units.px(BUBBLE_RING)
      val fx = hpad - ring
      val fy = bottom - faces.measuredHeight + ring
      faces.layout(fx, fy, fx + faces.measuredWidth, fy + faces.measuredHeight)
      x = fx + faces.measuredWidth - ring + units.px(10f)
    }
    val by = bottom - bubble.measuredHeight
    bubble.layout(x, by, x + bubble.measuredWidth, bottom)
    val bubbleHeight = units.px(38f)
    val dx = x + (bubble.measuredWidth - dots.measuredWidth) / 2
    val dy = by + (bubbleHeight - dots.measuredHeight) / 2
    dots.layout(dx, dy, dx + dots.measuredWidth, dy + dots.measuredHeight)
    shifted()
  }

  companion object {
    /** The ring around each photo beside the typing bubble. */
    const val BUBBLE_RING = 2f
  }
}
