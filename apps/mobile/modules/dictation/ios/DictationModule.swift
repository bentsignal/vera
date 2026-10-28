import AVFoundation
import ExpoModulesCore
import Speech

/// Speech to text for the composer's microphone, on the device where it
/// can be: iOS 26's `SpeechTranscriber` when its model is installed, and
/// otherwise `SFSpeechRecognizer`, on device where the phone supports it.
/// Sends the microphone's level (`onLevel`, 0 to 1) for the waveform while
/// it listens, and keeps listening in the background (the app has the
/// `audio` background mode), where iOS shows the microphone in the status
/// bar or Dynamic Island.
public class DictationModule: Module {
  private let lock = NSLock()
  private var session: DictationSession?

  public func definition() -> ModuleDefinition {
    Name("VeraDictation")

    Events("onLevel")

    /// Whether this phone can dictate, and whether it stays on the device.
    Function("support") { () -> [String: Any] in
      var onDevice = false
      if #available(iOS 26.0, *), SpeechTranscriber.isAvailable {
        onDevice = true
      }
      let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
      if recognizer?.supportsOnDeviceRecognition == true {
        onDevice = true
      }
      return ["available": onDevice || recognizer != nil, "onDevice": onDevice]
    }

    /// Asks for the microphone, then speech recognition. Resolves
    /// `{ granted }`, with `denied` naming the one refused.
    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      requestMicrophone { allowed in
        guard allowed else {
          promise.resolve(["granted": false, "denied": "microphone"])
          return
        }
        SFSpeechRecognizer.requestAuthorization { status in
          promise.resolve(
            status == .authorized
              ? ["granted": true]
              : ["granted": false, "denied": "speech"])
        }
      }
    }

    /// Starts listening. Any session already running is dropped.
    AsyncFunction("startAsync") { () async throws in
      let session = DictationSession { [weak self] level in
        self?.sendEvent("onLevel", ["level": level])
      }
      self.replace(with: session)?.cancel()
      do {
        try await session.start()
      } catch {
        self.drop(session)
        throw error
      }
    }

    /// Stops listening and resolves everything heard.
    AsyncFunction("finishAsync") { () async -> String in
      guard let session = self.replace(with: nil) else { return "" }
      return await session.finish()
    }

    /// Stops listening and drops what was heard.
    Function("cancel") {
      self.replace(with: nil)?.cancel()
    }
  }

  /// Stops `failed` and forgets it, unless another has replaced it.
  private func drop(_ failed: DictationSession) {
    lock.lock()
    if session === failed { session = nil }
    lock.unlock()
    failed.cancel()
  }

  /// Swaps the running session, returning the one it replaced.
  private func replace(with next: DictationSession?) -> DictationSession? {
    lock.lock()
    defer { lock.unlock() }
    let previous = session
    session = next
    return previous
  }
}

private func requestMicrophone(_ done: @escaping (Bool) -> Void) {
  if #available(iOS 17.0, *) {
    AVAudioApplication.requestRecordPermission(completionHandler: done)
  } else {
    AVAudioSession.sharedInstance().requestRecordPermission(done)
  }
}

/// What turns the microphone's audio into text.
protocol Transcriber: AnyObject {
  /// Called on the audio thread with each buffer, in order.
  func append(_ buffer: AVAudioPCMBuffer)
  /// Everything heard, once the last audio is through.
  func finish() async -> String
  func cancel()
}

/// One dictation: the microphone, and a transcriber picked once it's
/// running. Audio from before the transcriber is ready (its model loading)
/// waits for it, so the first words aren't lost.
final class DictationSession {
  private let capture: AudioCapture
  private let lock = NSLock()
  private var transcriber: Transcriber?
  private var waiting: [AVAudioPCMBuffer] = []
  private var ended = false

  init(onLevel: @escaping (Double) -> Void) {
    capture = AudioCapture(onLevel: onLevel)
    capture.onBuffer = { [weak self] buffer in self?.receive(buffer) }
  }

  func start() async throws {
    try capture.start()
    guard let chosen = await makeTranscriber() else {
      throw DictationError.unavailable
    }
    let adopted = lock.withLock {
      if ended { return false }
      transcriber = chosen
      for buffer in waiting { chosen.append(buffer) }
      waiting = []
      return true
    }
    if !adopted { chosen.cancel() }
  }

  func finish() async -> String {
    capture.stop()
    let chosen = lock.withLock {
      ended = true
      return transcriber
    }
    let text = await chosen?.finish() ?? ""
    capture.deactivate()
    return text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  func cancel() {
    capture.stop()
    lock.lock()
    ended = true
    let chosen = transcriber
    lock.unlock()
    chosen?.cancel()
    capture.deactivate()
  }

  private func receive(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    defer { lock.unlock() }
    if ended { return }
    if let transcriber {
      transcriber.append(buffer)
    } else if let copy = buffer.copied() {
      waiting.append(copy)
    }
  }

  private func makeTranscriber() async -> Transcriber? {
    if #available(iOS 26.0, *), let analyzer = await AnalyzerTranscriber.make() {
      return analyzer
    }
    return RecognizerTranscriber()
  }
}

enum DictationError: Error {
  case unavailable
  case noMicrophone
}

/// The microphone, through `AVAudioEngine`: each buffer goes to
/// `onBuffer`, and its loudness to `onLevel` about 16 times a second.
final class AudioCapture {
  var onBuffer: ((AVAudioPCMBuffer) -> Void)?
  private let onLevel: (Double) -> Void
  private let engine = AVAudioEngine()
  private var running = false
  private var loudest: Float = 0
  private var lastSent: CFTimeInterval = 0
  private static let levelInterval: CFTimeInterval = 0.06

  init(onLevel: @escaping (Double) -> Void) {
    self.onLevel = onLevel
  }

  func start() throws {
    let session = AVAudioSession.sharedInstance()
    // Other audio ducks while you talk; Bluetooth headsets' microphones work.
    try session.setCategory(
      .playAndRecord, mode: .default,
      options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP])
    try session.setActive(true)
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw DictationError.noMicrophone
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.handle(buffer)
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      throw error
    }
    running = true
  }

  func stop() {
    guard running else { return }
    running = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
  }

  /// Lets other apps' audio come back up.
  func deactivate() {
    try? AVAudioSession.sharedInstance().setActive(
      false, options: .notifyOthersOnDeactivation)
  }

  private func handle(_ buffer: AVAudioPCMBuffer) {
    onBuffer?(buffer)
    loudest = max(loudest, Self.level(of: buffer))
    let now = CACurrentMediaTime()
    if now - lastSent >= Self.levelInterval {
      lastSent = now
      onLevel(Double(loudest))
      loudest = 0
    }
  }

  /// How loud the buffer is, from silence (0) to loud speech (1).
  private static func level(of buffer: AVAudioPCMBuffer) -> Float {
    guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
    let count = Int(buffer.frameLength)
    var sum: Float = 0
    for index in 0..<count {
      sum += samples[index] * samples[index]
    }
    let rms = (sum / Float(count)).squareRoot()
    let decibels = 20 * log10(max(rms, 0.000_001))
    return min(max((decibels + 50) / 40, 0), 1)
  }
}

extension AVAudioPCMBuffer {
  /// A copy, for keeping a buffer past the tap that delivered it.
  func copied() -> AVAudioPCMBuffer? {
    guard let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameLength) else {
      return nil
    }
    copy.frameLength = frameLength
    let source = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: audioBufferList))
    let target = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    for (from, to) in zip(source, target) {
      guard let data = from.mData, let destination = to.mData else { continue }
      memcpy(destination, data, Int(min(from.mDataByteSize, to.mDataByteSize)))
    }
    return copy
  }
}

/// Text collected from a transcriber's results, read once it's done.
final class Collected {
  private let lock = NSLock()
  private var text = ""

  /// Adds a result, with a space between it and the one before.
  func append(_ more: String) {
    lock.lock()
    defer { lock.unlock() }
    if let last = text.last, let first = more.first, !last.isWhitespace, !first.isWhitespace {
      text += " "
    }
    text += more
  }

  var value: String {
    lock.lock()
    defer { lock.unlock() }
    return text
  }
}

/// iOS 26's on-device `SpeechTranscriber`, Apple's newest speech model.
/// Used only once its model is on the phone; a phone without it downloads
/// it in the background for next time and dictates with
/// `RecognizerTranscriber` now.
@available(iOS 26.0, *)
final class AnalyzerTranscriber: Transcriber {
  private let analyzer: SpeechAnalyzer
  private let format: AVAudioFormat
  private let input: AsyncStream<AnalyzerInput>.Continuation
  private let results: Task<Void, Never>
  private let collected: Collected
  private var converter: AVAudioConverter?

  private init(
    analyzer: SpeechAnalyzer, format: AVAudioFormat,
    input: AsyncStream<AnalyzerInput>.Continuation, results: Task<Void, Never>,
    collected: Collected
  ) {
    self.analyzer = analyzer
    self.format = format
    self.input = input
    self.results = results
    self.collected = collected
  }

  static func make() async -> AnalyzerTranscriber? {
    guard SpeechTranscriber.isAvailable,
      let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale.current)
    else { return nil }
    let module = SpeechTranscriber(locale: locale, preset: .transcription)
    switch await AssetInventory.status(forModules: [module]) {
    case .installed:
      break
    case .supported:
      Task.detached {
        if let request = try? await AssetInventory.assetInstallationRequest(supporting: [module]) {
          try? await request.downloadAndInstall()
        }
      }
      return nil
    default:
      return nil
    }
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) else {
      return nil
    }
    let collected = Collected()
    let results = Task {
      do {
        for try await result in module.results {
          collected.append(String(result.text.characters))
        }
      } catch {
        // Keeps what came before the error.
      }
    }
    let (stream, input) = AsyncStream<AnalyzerInput>.makeStream()
    let analyzer = SpeechAnalyzer(modules: [module])
    do {
      try await analyzer.prepareToAnalyze(in: format)
      try await analyzer.start(inputSequence: stream)
    } catch {
      results.cancel()
      return nil
    }
    return AnalyzerTranscriber(
      analyzer: analyzer, format: format, input: input, results: results,
      collected: collected)
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    guard let converted = convert(buffer) else { return }
    input.yield(AnalyzerInput(buffer: converted))
  }

  func finish() async -> String {
    input.finish()
    try? await analyzer.finalizeAndFinishThroughEndOfInput()
    await results.value
    return collected.value
  }

  func cancel() {
    input.finish()
    results.cancel()
    let analyzer = analyzer
    Task { await analyzer.cancelAndFinishNow() }
  }

  /// The buffer in the analyzer's format, as a new buffer.
  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    if buffer.format == format { return buffer.copied() }
    if converter == nil {
      converter = AVAudioConverter(from: buffer.format, to: format)
      converter?.primeMethod = .none
    }
    guard let converter else { return nil }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      return nil
    }
    var consumed = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil && output.frameLength > 0 ? output : nil
  }
}

/// `SFSpeechRecognizer`, for phones before iOS 26 or without its model
/// yet: on the device where the phone supports it, otherwise Apple's
/// servers.
final class RecognizerTranscriber: Transcriber {
  private let recognizer: SFSpeechRecognizer
  private let request = SFSpeechAudioBufferRecognitionRequest()
  private var task: SFSpeechRecognitionTask?
  private let lock = NSLock()
  /// Text from earlier stretches that the recognizer has let go of.
  private var kept = ""
  /// The current stretch's best transcription.
  private var latest = ""
  private var done = false
  private var waiter: CheckedContinuation<Void, Never>?

  init?() {
    guard let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer() else {
      return nil
    }
    self.recognizer = recognizer
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
    request.addsPunctuation = true
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        self.update(result.bestTranscription.formattedString)
        if result.isFinal { self.complete() }
      } else if error != nil {
        self.complete()
      }
    }
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    request.append(buffer)
  }

  func finish() async -> String {
    request.endAudio()
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      lock.lock()
      if done {
        lock.unlock()
        continuation.resume()
        return
      }
      waiter = continuation
      lock.unlock()
      // The last result can be slow, or never come; keep what's heard.
      DispatchQueue.global().asyncAfter(deadline: .now() + 4) { [weak self] in
        self?.complete()
      }
    }
    return lock.withLock {
      [kept, latest].filter { !$0.isEmpty }.joined(separator: " ")
    }
  }

  func cancel() {
    task?.cancel()
    complete()
  }

  /// After a long pause, on-device recognition can start a new stretch
  /// whose results no longer include the earlier words; those are kept.
  private func update(_ text: String) {
    lock.lock()
    defer { lock.unlock() }
    let previous = latest
    if !previous.isEmpty, !text.hasPrefix(String(previous.prefix(8))),
      text.count < previous.count / 2
    {
      kept = [kept, previous].filter { !$0.isEmpty }.joined(separator: " ")
    }
    latest = text
  }

  private func complete() {
    lock.lock()
    done = true
    let waiting = waiter
    waiter = nil
    lock.unlock()
    waiting?.resume()
  }
}
