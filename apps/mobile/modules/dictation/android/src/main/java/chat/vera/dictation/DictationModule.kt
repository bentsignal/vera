package chat.vera.dictation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * Speech to text for the composer's microphone, with Android's speech
 * recognizer: on the device where it can be (Android 12 and later, with
 * the language downloaded), otherwise the phone's recognition service,
 * asked to stay offline. Sends the microphone's level (`onLevel`, 0 to 1)
 * for the waveform while it listens.
 */
class DictationModule : Module() {
  private var session: Session? = null

  override fun definition() = ModuleDefinition {
    Name("VeraDictation")

    Events("onLevel")

    Function("support") {
      val context = appContext.reactContext
      val onDevice = context != null && onDeviceAvailable(context)
      val available =
        context != null && (onDevice || SpeechRecognizer.isRecognitionAvailable(context))
      mapOf("available" to available, "onDevice" to onDevice)
    }

    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECORD_AUDIO,
      )
    }

    AsyncFunction("startAsync") {
      val context = appContext.reactContext ?: throw IllegalStateException("No context")
      session?.cancel()
      session = Session(context) { level -> sendEvent("onLevel", mapOf("level" to level)) }
        .also { it.start() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("finishAsync") { promise: Promise ->
      val current = session
      session = null
      if (current == null) promise.resolve("") else current.finish(promise)
    }.runOnQueue(Queues.MAIN)

    Function("cancel") {
      val current = session
      session = null
      if (current != null) Handler(Looper.getMainLooper()).post { current.cancel() }
    }

    OnDestroy {
      session?.cancel()
      session = null
    }
  }
}

private fun onDeviceAvailable(context: Context) =
  Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
    SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

/**
 * One dictation. Android's recognizer stops by itself after a pause, so
 * each time it does, what it heard is kept and it listens again, until
 * `finish` or `cancel`. Runs on the main thread.
 */
private class Session(
  private val context: Context,
  private val onLevel: (Double) -> Unit,
) : RecognitionListener {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var onDevice = onDeviceAvailable(context)
  private val kept = StringBuilder()
  /** The current stretch's latest words, until it ends. */
  private var partial = ""
  private var finishing: Promise? = null
  private var ended = false
  /** Errors in a row with nothing heard, to stop retrying a broken recognizer. */
  private var failures = 0
  private var loudest = 0.0
  private var lastLevel = 0L

  fun start() = listen()

  fun finish(promise: Promise) {
    if (ended) {
      promise.resolve(kept.toString())
      return
    }
    finishing = promise
    recognizer?.stopListening()
    // The last result can be slow, or never come; keep what's heard.
    main.postDelayed({ complete() }, 4000)
  }

  fun cancel() {
    ended = true
    main.removeCallbacksAndMessages(null)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
  }

  private fun listen() {
    if (ended) return
    recognizer?.destroy()
    val next =
      if (onDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
      } else {
        SpeechRecognizer.createSpeechRecognizer(context)
      }
    next.setRecognitionListener(this)
    recognizer = next
    partial = ""
    next.startListening(intent())
  }

  private fun intent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    // Pauses to think shouldn't end it (recognizers may ignore these).
    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 10_000L)
    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 10_000L)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      putExtra(
        RecognizerIntent.EXTRA_ENABLE_FORMATTING,
        RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY,
      )
    }
  }

  private fun keep(text: String) {
    val words = text.trim()
    if (words.isEmpty()) return
    if (kept.isNotEmpty()) kept.append(' ')
    kept.append(words)
  }

  private fun complete() {
    val promise = finishing ?: return
    finishing = null
    keep(partial)
    partial = ""
    cancel()
    promise.resolve(kept.toString())
  }

  private fun best(results: Bundle?) =
    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

  override fun onResults(results: Bundle?) {
    partial = best(results) ?: partial
    if (finishing != null) {
      complete()
      return
    }
    keep(partial)
    partial = ""
    failures = 0
    listen()
  }

  override fun onPartialResults(results: Bundle?) {
    best(results)?.let { if (it.isNotBlank()) partial = it }
  }

  override fun onError(error: Int) {
    if (finishing != null) {
      complete()
      return
    }
    if (ended) return
    keep(partial)
    partial = ""
    val languageMissing =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
          error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
    if (languageMissing && onDevice) {
      // This language isn't downloaded for on-device recognition.
      onDevice = false
      listen()
      return
    }
    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
      ended = true
      return
    }
    // A pause with nothing said ends it too; keep listening, unless the
    // recognizer keeps failing.
    failures += 1
    if (failures > 5) {
      ended = true
      return
    }
    main.postDelayed({ listen() }, 150)
  }

  override fun onRmsChanged(rmsdB: Float) {
    loudest = maxOf(loudest, ((rmsdB + 2.0) / 12.0).coerceIn(0.0, 1.0))
    val now = SystemClock.uptimeMillis()
    if (now - lastLevel >= 60) {
      lastLevel = now
      onLevel(loudest)
      loudest = 0.0
    }
  }

  override fun onReadyForSpeech(params: Bundle?) = Unit

  override fun onBeginningOfSpeech() {
    failures = 0
  }

  override fun onBufferReceived(buffer: ByteArray?) = Unit

  override fun onEndOfSpeech() = Unit

  override fun onEvent(eventType: Int, params: Bundle?) = Unit
}
