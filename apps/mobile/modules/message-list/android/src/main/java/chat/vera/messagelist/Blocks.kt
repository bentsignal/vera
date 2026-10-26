package chat.vera.messagelist

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.ImageView
import android.widget.TextView

// The blocks a message is made of, as views. Each knows its size from its
// data before anything loads, so a row never changes height as it fills in.

/**
 * A message's text in its bubble: a rounded background, with the tail on
 * the last of a run, drawn under the text. Also draws the bordered bubble
 * of a deleted message (`outlined`).
 */
@SuppressLint("AppCompatCustomView")
class BubbleTextView(context: Context, private val units: Units) : ListText(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val path = Path()
  private var tail = false
  private var isOwn = false
  private var outlined = false
  private var radiusDp = 20f
  private var pathFor = 0L

  init {
    includeFontPadding = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    setPadding(units.px(14f), units.px(8f), units.px(14f), units.px(8f))
  }

  fun bindBubble(color: Int, tail: Boolean, isOwn: Boolean, radiusDp: Float, outlined: Boolean = false) {
    if (tail != this.tail) {
      this.tail = tail
      setPadding(units.px(14f), units.px(8f), units.px(14f), units.px(8f) + if (tail) units.px(BubbleShape.TAIL_DROP) else 0)
    }
    this.isOwn = isOwn
    this.outlined = outlined
    this.radiusDp = radiusDp
    paint.color = color
    paint.style = if (outlined) Paint.Style.STROKE else Paint.Style.FILL
    paint.strokeWidth = units.pxf(1f)
    pathFor = 0L
    invalidate()
  }

  private companion object {
    /** React Native's `TEXT_IN`: the text fades in over this, after the bubble's grown. */
    const val TEXT_IN_MS = 220f

    /** About how bright a typing dot is between pulses. */
    const val DOT_REST_ALPHA = 0.5f
  }

  /** As wide as its widest line, like a bubble in Messages, not as wide as it may be. */
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    val layout = layout ?: return
    if (layout.lineCount < 2 || MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.EXACTLY) return
    var widest = 0f
    for (line in 0 until layout.lineCount) widest = maxOf(widest, layout.getLineWidth(line))
    val tight = Math.ceil(widest.toDouble()).toInt() + totalPaddingLeft + totalPaddingRight
    if (tight < measuredWidth) setMeasuredDimension(tight, measuredHeight)
  }

  private var growFromWidth = 0f
  private var growFromHeight = 0f
  private var growth = 1f
  private var textShown = 1f
  private var growAnimator: android.animation.ValueAnimator? = null
  private val growPath = Path()
  private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  /**
   * Grows from a bubble `fromWidth` by `fromHeight` (who's typing) to its
   * own size, from its tail's corner, as the React Native list's
   * `BubbleMorph`: the typing dots (`dotsColor`) gone by a third of the
   * way, then, once it's its size, its text fading in, so the text never
   * spills out of a bubble still growing.
   */
  fun grow(fromWidth: Float, fromHeight: Float, ms: Long, dotsColor: Int) {
    growAnimator?.cancel()
    growFromWidth = fromWidth
    growFromHeight = fromHeight
    dotPaint.color = dotsColor
    growth = 0f
    textShown = 0f
    growAnimator = android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
      duration = ms + TEXT_IN_MS.toLong()
      interpolator = android.view.animation.LinearInterpolator()
      addUpdateListener {
        val elapsed = currentPlayTime.toFloat()
        growth = EASE.getInterpolation((elapsed / ms).coerceIn(0f, 1f))
        textShown = ((elapsed - ms) / TEXT_IN_MS).coerceIn(0f, 1f)
        if (animatedFraction >= 1f) {
          growth = 1f
          textShown = 1f
        }
        invalidate()
      }
      start()
    }
    invalidate()
  }

  /** A frame of `grow`: the bubble between the typing bubble's size and its own, the text fading in. */
  private fun drawGrowing(canvas: Canvas) {
    val drop = if (tail) units.pxf(BubbleShape.TAIL_DROP) else 0f
    val fullHeight = height - drop
    val w = growFromWidth + (width - growFromWidth) * growth
    val h = growFromHeight + (fullHeight - growFromHeight) * growth
    BubbleShape.path(growPath, w, h, radiusDp, tail, isOwn, units.density)
    canvas.save()
    // From the tail's corner: bottom left for theirs, bottom right for yours.
    canvas.translate(if (isOwn) width - w else 0f, fullHeight - h)
    canvas.drawPath(growPath, paint)
    canvas.restore()
    drawLeavingDots(canvas, fullHeight)
    val alpha = (textShown * 255).toInt()
    val saved = canvas.saveLayerAlpha(0f, 0f, width.toFloat(), height.toFloat(), alpha)
    super.onDraw(canvas)
    canvas.restoreToCount(saved)
  }

  /** The typing dots where they were in the typing bubble, fading out by a third of the growth. */
  private fun drawLeavingDots(canvas: Canvas, fullHeight: Float) {
    val shown = 1f - growth * 3f
    if (shown <= 0f) return
    val dot = units.pxf(8f)
    val gap = units.pxf(4f)
    val left = if (isOwn) width - growFromWidth else 0f
    val cx = left + growFromWidth / 2f
    val cy = fullHeight - growFromHeight / 2f
    val base = dotPaint.alpha
    dotPaint.alpha = (base * shown * DOT_REST_ALPHA).toInt()
    for (index in -1..1) canvas.drawCircle(cx + index * (dot + gap), cy, dot / 2f, dotPaint)
    dotPaint.alpha = base
  }

  override fun onDraw(canvas: Canvas) {
    if (growth < 1f || textShown < 1f) {
      drawGrowing(canvas)
      return
    }
    val drop = if (tail) units.pxf(BubbleShape.TAIL_DROP) else 0f
    val key = (width.toLong() shl 32) or height.toLong()
    if (key != pathFor) {
      BubbleShape.path(path, width.toFloat(), height - drop, radiusDp, tail && !outlined, isOwn, units.density)
      if (outlined) {
        path.reset()
        val inset = paint.strokeWidth / 2f
        val r = units.pxf(radiusDp)
        path.addRoundRect(RectF(inset, inset, width - inset, height - drop - inset), r, r, Path.Direction.CW)
      }
      pathFor = key
    }
    canvas.drawPath(path, paint)
    super.onDraw(canvas)
  }
}

/** A box with rounded corners that clips what's in it. */
open class RoundedBox(context: Context, private val radiusPx: Float) : ViewGroup(context) {
  init {
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
      }
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}

/**
 * A link's card: its image, if it has one, at the image's shape, then the
 * site, the title (two lines), and the description (two), on the page's
 * color with a hairline border.
 */
class LinkCardView(context: Context, private val units: Units, private val images: Images) :
  RoundedBox(context, units.pxf(16f)) {
  private val image = FixedImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
  private val site = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.END
    isAllCaps = true
  }
  private val title = plainText(context).apply {
    maxLines = 2
    ellipsize = TextUtils.TruncateAt.END
  }
  private val description = plainText(context).apply {
    maxLines = 2
    ellipsize = TextUtils.TruncateAt.END
  }
  private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private var imageHeight = 0
  private var cardWidth = 0
  private var block: LinkCardBlock? = null

  init {
    setWillNotDraw(false)
    addView(image)
    addView(site)
    addView(title)
    addView(description)
  }

  fun bind(block: LinkCardBlock, theme: Theme, maxWidth: Int) {
    this.block = block
    cardWidth = minOf(units.px(256f), maxWidth)
    setBackgroundColor(theme.backgroundElevated)
    border.color = theme.separator
    border.strokeWidth = maxOf(1f, units.pxf(0.5f))
    imageHeight = if (block.imageUrl == null) 0 else {
      val w = block.imageWidth ?: 0
      val h = block.imageHeight ?: 0
      val ratio = if (w > 0 && h > 0) h.toFloat() / w else 1f / 1.91f
      minOf((cardWidth * ratio).toInt(), units.px(320f))
    }
    image.visibility = if (imageHeight > 0) VISIBLE else GONE
    image.setBackgroundColor(theme.fill)
    images.load(image, block.imageUrl, cardWidth, imageHeight)
    site.style(units, theme.caption, theme.muted)
    site.text = block.site
    site.visibility = if (block.site.isEmpty()) GONE else VISIBLE
    title.style(units, theme.subhead, theme.foreground, Fonts.semibold)
    title.text = block.title
    title.visibility = if (block.title.isNullOrEmpty()) GONE else VISIBLE
    description.style(units, theme.footnote, theme.muted)
    description.text = block.description
    description.visibility = if (block.description.isNullOrEmpty()) GONE else VISIBLE
    requestLayout()
  }

  private val texts get() = listOf(site, title, description).filter { it.visibility == VISIBLE }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    var height = imageHeight
    if (imageHeight > 0) {
      image.measure(MeasureSpec.makeMeasureSpec(cardWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(imageHeight, MeasureSpec.EXACTLY))
    }
    val textWidth = cardWidth - units.px(24f)
    val shown = texts
    if (shown.isNotEmpty()) {
      height += units.px(10f)
      shown.forEachIndexed { index, text ->
        text.measure(MeasureSpec.makeMeasureSpec(textWidth, MeasureSpec.EXACTLY), MeasureSpec.UNSPECIFIED)
        height += text.measuredHeight + if (index > 0) units.px(2f) else 0
      }
      height += units.px(10f)
    }
    setMeasuredDimension(cardWidth, height)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    if (imageHeight > 0) image.layout(0, 0, cardWidth, imageHeight)
    var y = imageHeight + units.px(10f)
    val x = units.px(12f)
    texts.forEachIndexed { index, text ->
      if (index > 0) y += units.px(2f)
      text.layout(x, y, x + text.measuredWidth, y + text.measuredHeight)
      y += text.measuredHeight
    }
  }

  override fun dispatchDraw(canvas: Canvas) {
    super.dispatchDraw(canvas)
    val inset = border.strokeWidth / 2f
    val r = units.pxf(16f)
    canvas.drawRoundRect(RectF(inset, inset, width - inset, height - inset), r, r, border)
  }
}

/** A file: an icon on the accent color, its name, and its size, in an incoming bubble's color. */
class FileCardView(context: Context, private val units: Units) : RoundedBox(context, units.pxf(16f)) {
  private val icon = object : View(context) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(canvas: Canvas) {
      val r = units.pxf(8f)
      canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), r, r, paint)
      // A page with its corner folded.
      val w = width.toFloat()
      val h = height.toFloat()
      val page = Path().apply {
        moveTo(w * 0.32f, h * 0.24f)
        lineTo(w * 0.58f, h * 0.24f)
        lineTo(w * 0.7f, h * 0.36f)
        lineTo(w * 0.7f, h * 0.76f)
        lineTo(w * 0.32f, h * 0.76f)
        close()
      }
      canvas.drawPath(page, glyph)
    }
  }
  private val name = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.MIDDLE
  }
  private val size = plainText(context).apply { isSingleLine = true }
  private var cardWidth = 0

  init {
    addView(icon)
    addView(name)
    addView(size)
  }

  fun bind(block: FileBlock, theme: Theme, maxWidth: Int) {
    cardWidth = minOf(units.px(256f), maxWidth)
    setBackgroundColor(theme.bubbleIncoming)
    icon.paint.color = theme.accent
    icon.glyph.color = theme.onAccent
    icon.invalidate()
    name.style(units, theme.subhead, theme.foreground, Fonts.semibold)
    name.text = block.name
    size.style(units, theme.footnote, theme.muted)
    size.text = block.sizeLabel
    requestLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val iconSize = units.px(40f)
    icon.measure(MeasureSpec.makeMeasureSpec(iconSize, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(iconSize, MeasureSpec.EXACTLY))
    val textWidth = cardWidth - units.px(24f) - iconSize - units.px(12f)
    name.measure(MeasureSpec.makeMeasureSpec(textWidth, MeasureSpec.EXACTLY), MeasureSpec.UNSPECIFIED)
    size.measure(MeasureSpec.makeMeasureSpec(textWidth, MeasureSpec.EXACTLY), MeasureSpec.UNSPECIFIED)
    val content = maxOf(iconSize, name.measuredHeight + size.measuredHeight)
    setMeasuredDimension(cardWidth, content + units.px(24f))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val pad = units.px(12f)
    val iconSize = icon.measuredWidth
    val content = measuredHeight - pad * 2
    val iconTop = pad + (content - iconSize) / 2
    icon.layout(pad, iconTop, pad + iconSize, iconTop + iconSize)
    val x = pad + iconSize + pad
    val textHeight = name.measuredHeight + size.measuredHeight
    var y = pad + (content - textHeight) / 2
    name.layout(x, y, x + name.measuredWidth, y + name.measuredHeight)
    y += name.measuredHeight
    size.layout(x, y, x + size.measuredWidth, y + size.measuredHeight)
  }
}

/**
 * The message a reply answers. In bubbles, a bordered card above the
 * reply with the author and two lines of text; in stacked rows, a line
 * with a curve down to the reply's photo, the author's photo, and the
 * text after their name.
 */
class QuoteView(context: Context, private val units: Units, private val images: Images) : ViewGroup(context) {
  private val author = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.END
  }
  private val text = plainText(context).apply { ellipsize = TextUtils.TruncateAt.END }
  private val avatar = AvatarView(context, units)

  /** The quoted message's photo, beside the text (bubbles). */
  private val thumb = object : FixedImageView(context) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) = setMeasuredDimension(units.px(32f), units.px(32f))
  }.apply {
    scaleType = ImageView.ScaleType.CENTER_CROP
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) = outline.setRoundRect(0, 0, view.width, view.height, units.pxf(6f))
    }
  }
  private var hasThumb = false
  private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val curve = Path()
  private var stacked = false
  private var maxWidth = 0

  /** Stacked: where the reply's photo column's middle is, from this view's left. */
  var curveFrom = 0

  init {
    setWillNotDraw(false)
    addView(author)
    addView(text)
    addView(avatar)
    addView(thumb)
  }

  fun bind(block: QuoteBlock, theme: Theme, stacked: Boolean, maxWidth: Int) {
    this.stacked = stacked
    this.maxWidth = maxWidth
    border.color = theme.separator
    if (stacked) {
      thumb.visibility = GONE
      hasThumb = false
      author.visibility = GONE
      avatar.visibility = VISIBLE
      avatar.bind(block.author, theme, 18f, images)
      text.style(units, theme.footnote, theme.muted)
      text.isSingleLine = true
      val line = android.text.SpannableStringBuilder()
      line.append(block.author.name)
      line.setSpan(WeightSpan(Fonts.semibold), 0, line.length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      line.append(" ").append(block.text)
      text.text = line
      border.strokeWidth = units.pxf(2f)
    } else {
      hasThumb = block.thumbnailUrl != null
      thumb.visibility = if (hasThumb) VISIBLE else GONE
      thumb.setBackgroundColor(theme.fill)
      if (hasThumb) images.load(thumb, block.thumbnailUrl, units.px(32f), units.px(32f))
      author.visibility = VISIBLE
      avatar.visibility = GONE
      author.style(units, theme.caption, theme.muted, Fonts.semibold)
      author.text = block.author.name
      text.style(units, theme.footnote, theme.muted)
      text.isSingleLine = false
      text.maxLines = 2
      text.text = block.text
      border.strokeWidth = units.pxf(1f)
    }
    requestLayout()
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val maxWidth = if (maxWidth > 0) maxWidth else MeasureSpec.getSize(widthMeasureSpec)
    if (stacked) {
      avatar.measure(0, 0)
      val textX = curveFrom + units.px(18f + 4f + 6f) + avatar.measuredWidth
      text.measure(MeasureSpec.makeMeasureSpec(maxOf(0, maxWidth - textX), MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
      setMeasuredDimension(maxWidth, units.px(16f) + maxOf(avatar.measuredHeight, text.measuredHeight))
      return
    }
    val beside = if (hasThumb) units.px(40f) else 0
    val inner = maxWidth - units.px(24f) - beside
    author.measure(MeasureSpec.makeMeasureSpec(inner, MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    text.measure(MeasureSpec.makeMeasureSpec(inner, MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    if (hasThumb) thumb.measure(0, 0)
    val width = maxOf(author.measuredWidth, text.measuredWidth) + units.px(24f) + beside
    setMeasuredDimension(width, author.measuredHeight + text.measuredHeight + units.px(12f))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    if (stacked) {
      val top = units.px(16f)
      val x = curveFrom + units.px(18f + 4f)
      val line = maxOf(avatar.measuredHeight, text.measuredHeight)
      val ay = top + (line - avatar.measuredHeight) / 2
      avatar.layout(x, ay, x + avatar.measuredWidth, ay + avatar.measuredHeight)
      val tx = x + avatar.measuredWidth + units.px(6f)
      val ty = top + (line - text.measuredHeight) / 2
      text.layout(tx, ty, tx + text.measuredWidth, ty + text.measuredHeight)
      return
    }
    if (hasThumb) {
      val tx = measuredWidth - units.px(12f) - thumb.measuredWidth
      val ty = (measuredHeight - thumb.measuredHeight) / 2
      thumb.layout(tx, ty, tx + thumb.measuredWidth, ty + thumb.measuredHeight)
    }
    val x = units.px(12f)
    var y = units.px(6f)
    author.layout(x, y, x + author.measuredWidth, y + author.measuredHeight)
    y += author.measuredHeight
    text.layout(x, y, x + text.measuredWidth, y + text.measuredHeight)
  }

  override fun onDraw(canvas: Canvas) {
    if (stacked) {
      // From the reply's photo column up and over to the quoted photo.
      val x = curveFrom.toFloat()
      val midY = units.pxf(16f) + avatar.measuredHeight / 2f
      val bottom = height.toFloat() + units.pxf(6f)
      val r = units.pxf(10f)
      curve.reset()
      curve.moveTo(x, bottom)
      curve.lineTo(x, midY + r)
      curve.quadTo(x, midY, x + r, midY)
      curve.lineTo(x + units.pxf(18f), midY)
      canvas.drawPath(curve, border)
      return
    }
    val inset = border.strokeWidth / 2f
    val r = units.pxf(16f)
    canvas.drawRoundRect(RectF(inset, inset, width - inset, height - inset), r, r, border)
  }
}

/** One line under a message: "Edited", "Not sent", or a thread's "2 replies" with photos. */
class FooterView(context: Context, private val units: Units, private val images: Images) : ViewGroup(context) {
  private val faces = FacesView(context, units)
  private val label = plainText(context).apply {
    isSingleLine = true
    ellipsize = TextUtils.TruncateAt.END
  }
  private val pill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val badge = Paint(Paint.ANTI_ALIAS_FLAG)
  private val badgeMark = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = Fonts.bold
    color = 0xFFFFFFFF.toInt()
  }
  private var notSent = false
  private var isPill = false
  private var alignEnd = false

  init {
    setWillNotDraw(false)
    addView(faces)
    addView(label)
  }

  /** `pill`: stacked rows' replies, on the fill color. */
  fun bind(line: FooterLine, theme: Theme, stacked: Boolean, alignEnd: Boolean, rowId: String) {
    this.alignEnd = alignEnd
    val replies = line.kind == "replies"
    isPill = replies && stacked
    notSent = line.kind == "notSent"
    badge.color = theme.destructive
    pill.color = theme.fill
    faces.visibility = if (replies && line.people.isNotEmpty()) VISIBLE else GONE
    if (replies) faces.bind(line.people, theme, images, 18f, 6f, 1f, 3)
    when (line.kind) {
      "replies" -> label.style(units, theme.footnote, if (stacked) theme.foreground else theme.accent, Fonts.semibold)
      "notSent" -> label.style(units, theme.caption, theme.destructive)
      else -> label.style(units, theme.caption, theme.muted)
    }
    label.text = if (isPill) "${line.text}  ›" else line.text
    pressTarget = when (line.kind) {
      "replies" -> Target("replies", rowId)
      "notSent" -> Target("notSent", rowId)
      else -> null
    }
    requestLayout()
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val max = MeasureSpec.getSize(widthMeasureSpec)
    val padL = if (isPill) units.px(6f) else units.px(4f)
    val padR = if (isPill) units.px(10f) else units.px(4f)
    val padV = if (isPill) units.px(4f) else units.px(2f)
    var used = padL + padR + if (notSent) units.px(12f + 4f) else 0
    if (faces.visibility == VISIBLE) {
      faces.measure(0, 0)
      used += faces.measuredWidth + units.px(6f)
    }
    label.measure(MeasureSpec.makeMeasureSpec(maxOf(0, max - used), MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED)
    val content = maxOf(label.measuredHeight, if (faces.visibility == VISIBLE) faces.measuredHeight else 0)
    val top = if (isPill) units.px(6f) else 0
    setMeasuredDimension(used + label.measuredWidth, top + content + padV * 2)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val padL = if (isPill) units.px(6f) else units.px(4f)
    val padV = if (isPill) units.px(4f) else units.px(2f)
    val top = if (isPill) units.px(6f) else 0
    val content = measuredHeight - top - padV * 2
    val views = ArrayList<View>()
    if (faces.visibility == VISIBLE) views.add(faces)
    views.add(label)
    if (alignEnd && !isPill) views.reverse()
    var x = padL + if (notSent) units.px(12f + 4f) else 0
    for (view in views) {
      val y = top + padV + (content - view.measuredHeight) / 2
      view.layout(x, y, x + view.measuredWidth, y + view.measuredHeight)
      x += view.measuredWidth + units.px(6f)
    }
  }

  override fun onDraw(canvas: Canvas) {
    if (notSent) {
      // RN's exclamation circle, before "Not sent".
      val r = units.pxf(6f)
      val cx = units.pxf(4f) + r
      val cy = label.top + label.height / 2f
      canvas.drawCircle(cx, cy, r, badge)
      badgeMark.textSize = units.pxf(9f)
      canvas.drawText("!", cx, cy - (badgeMark.descent() + badgeMark.ascent()) / 2f, badgeMark)
    }
    if (!isPill) return
    val top = units.pxf(6f)
    val rect = RectF(0f, top, width.toFloat(), height.toFloat())
    canvas.drawRoundRect(rect, rect.height() / 2f, rect.height() / 2f, pill)
  }
}

/** Center a text view horizontally, for headers and notices. */
fun TextView.centered() {
  gravity = Gravity.CENTER_HORIZONTAL
  textAlignment = View.TEXT_ALIGNMENT_CENTER
}
