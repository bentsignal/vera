package chat.vera.messagelist

/**
 * A lower bound, in dp, for the rows still above the reader. A visible
 * media row is not a useful estimate for the short text rows above it.
 * Ignoring wrapped lines, tapbacks and footers deliberately asks early.
 */
fun olderRowsWithin(rows: List<Row>, last: Int, ahead: Float, theme: Theme, fontScale: Float = 1f, width: Float = 0f): Boolean {
  var remaining = 0f
  for (index in last + 1 until rows.size) {
    val row = rows[index] as? MessageRow ?: continue
    remaining += if (row.stacked) {
      if (row.startsGroup) 44f else 6f
    } else if (row.startsGroup) theme.runGap else theme.rowGap
    val inner = width - theme.horizontalPadding * 2
    val column = if (row.stacked) inner - theme.avatarSize - 12 else
      minOf(inner * theme.bubbleMaxWidthFraction, inner - if (row.showAuthor && !row.isOwn) 38 else 0)
    // A quote can indent the following part by 22dp. Reserve it even for
    // non-replies so this stays a lower bound at every viewport width.
    val mediaWidth = minOf(240f, (column - 22).coerceAtLeast(0f))
    for (block in row.blocks) {
      remaining += when (block) {
        is TextBlock -> fontScale * (if (block.jumbo) theme.jumbo.lineHeight else theme.body.lineHeight)
        is DeletedBlock, is UnknownBlock -> fontScale * theme.body.lineHeight
        is MediaBlock -> when {
          block.items.size > 1 -> if (row.stacked) 200f else 160f
          block.items.size == 1 -> block.items.first().let { item ->
            // Leave one dp for pixel rounding in the actual cell.
            (if (item.width > 0 && item.height > 0) minOf(300f, mediaWidth * item.height / item.width) else mediaWidth) - 1f
          }.coerceAtLeast(0f)
          else -> 0f
        }
        // Other block sizes depend on the viewport; zero keeps the bound conservative.
        else -> 0f
      }
    }
    if (remaining >= ahead) return false
  }
  return true
}
