package chat.vera.messagelist

/** A media item has its own part ID, distinct from its containing block. */
internal fun liftBlockSlot(blocks: List<Block>, rendered: List<Int>, part: String?): Int? {
  if (part == null) return rendered.indices.firstOrNull()
  return rendered.indexOfFirst { index ->
    val block = blocks.getOrNull(index)
    block?.part == part || (block is MediaBlock && block.items.any { it.part == part })
  }.takeIf { it >= 0 }
}
