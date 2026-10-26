package chat.vera.messagelist

import java.lang.ref.WeakReference

/** One scoped owner's registrations. A cached choice must not hide duplicates. */
internal class WeakHosts<T : Any> {
  private val entries = mutableListOf<WeakReference<T>>()
  val empty: Boolean get() = entries.isEmpty()

  fun add(value: T) {
    remove(value)
    entries.add(WeakReference(value))
  }

  fun remove(value: T) {
    entries.removeAll { it.get() == null || it.get() === value }
  }

  fun single(valid: (T) -> Boolean): T? {
    entries.removeAll { reference -> reference.get()?.let { !valid(it) } ?: true }
    return entries.singleOrNull()?.get()
  }
}
