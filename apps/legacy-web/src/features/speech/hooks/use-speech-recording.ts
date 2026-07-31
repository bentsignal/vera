import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { modelPresets } from "@acme/db/models/presets";
import { MAX_RECORDING_DURATION } from "@acme/features/speech";

import { fal } from "~/lib/fal-client";

function clearTimerRefs(
  durationIntervalRef: React.RefObject<NodeJS.Timeout | null>,
  maxDurationTimeoutRef: React.RefObject<NodeJS.Timeout | null>,
) {
  if (durationIntervalRef.current) {
    clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = null;
  }
  if (maxDurationTimeoutRef.current) {
    clearTimeout(maxDurationTimeoutRef.current);
    maxDurationTimeoutRef.current = null;
  }
}

async function fileToDataUri(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read audio file"));
    reader.readAsDataURL(file);
  });
}

async function transcribeWithFal(audioFile: File) {
  try {
    // The preset decides how to shape the input — scribe-v2 inlines a data
    // URI, wizper uploads to fal storage first, future models pick their own
    // strategy. The proxy at /api/fal/proxy gates the submit with rate-limit
    // + usage checks and logs usage on the result fetch.
    const input = await modelPresets.transcription.getInput(audioFile, {
      uploadToFal: (audio) => fal.storage.upload(audio),
      toDataUri: fileToDataUri,
    });
    const response = await fal.subscribe(modelPresets.transcription.model, {
      input,
    });
    const result = modelPresets.transcription.getResult(response);
    if (result.error) {
      return { data: null, error: result.error } as const;
    }
    return { data: result.text, error: null } as const;
  } catch (error) {
    return { data: null, error } as const;
  }
}

// Scribe v2 accepts mp3/ogg/wav/m4a/aac. Pick a MediaRecorder MIME type whose
// container Scribe will accept. Ogg is preferred because Scribe recognizes
// its MIME unambiguously in a data URI; mp4/AAC is the Safari fallback.
const SCRIBE_RECORDER_FORMATS = [
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/ogg", extension: "ogg" },
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/wav", extension: "wav" },
] as const;

// 32 kbps is plenty for speech (Scribe downsamples to 16 kHz anyway) and
// keeps the base64-encoded payload well under Vercel's 4.5 MB function body
// cap across any sane MAX_RECORDING_DURATION.
const RECORDER_BITRATE = 32_000;

function pickRecorderFormat() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return SCRIBE_RECORDER_FORMATS.find((format) =>
    MediaRecorder.isTypeSupported(format.mimeType),
  );
}

async function processTranscription(options: {
  audioChunksRef: React.RefObject<Blob[]>;
  extension: string;
  mimeType: string;
  recordingDuration: number;
  setIsTranscribing: (v: boolean) => void;
  setRecordingDuration: (v: number) => void;
  setStream: (v: MediaStream | null) => void;
  setTranscribedAudio: (v: string | null) => void;
}) {
  const {
    audioChunksRef,
    extension,
    mimeType,
    recordingDuration,
    setIsTranscribing,
    setRecordingDuration,
    setStream,
    setTranscribedAudio,
  } = options;
  setIsTranscribing(true);

  const audioBlob = new File(audioChunksRef.current, `recording.${extension}`, {
    type: mimeType,
  });

  const audioDurationSeconds = recordingDuration / 1000;
  if (audioDurationSeconds > MAX_RECORDING_DURATION) {
    toast.error(`Recording exceeds ${MAX_RECORDING_DURATION} second limit`);
    setIsTranscribing(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
    setStream(null);
    return;
  }

  const { data: transcript, error: transcriptionError } =
    await transcribeWithFal(audioBlob);
  if (transcript === null) {
    console.error(transcriptionError);
    toast.error("Ran into an error while transcribing audio");
    audioChunksRef.current = [];
    setStream(null);
    setIsTranscribing(false);
    setRecordingDuration(0);
    return;
  }

  setTranscribedAudio(transcript.length > 0 ? transcript : null);

  audioChunksRef.current = [];
  setStream(null);
  setIsTranscribing(false);
  setRecordingDuration(0);
}

interface BeginRecordingOptions {
  audioChunksRef: React.RefObject<Blob[]>;
  cancelRequestedRef: React.RefObject<boolean>;
  mediaRecorderRef: React.RefObject<MediaRecorder | null>;
  recordingDuration: number;
  recordingStartTimeRef: React.RefObject<number | null>;
  durationIntervalRef: React.RefObject<NodeJS.Timeout | null>;
  maxDurationTimeoutRef: React.RefObject<NodeJS.Timeout | null>;
  setIsRecording: (v: boolean) => void;
  setIsTranscribing: (v: boolean) => void;
  setRecordingDuration: (v: number) => void;
  setStream: (v: MediaStream | null) => void;
  setTranscribedAudio: (v: string | null) => void;
  onExpiredCancel: () => void;
}

async function beginRecording(options: BeginRecordingOptions) {
  const {
    audioChunksRef,
    cancelRequestedRef,
    mediaRecorderRef,
    recordingDuration,
    recordingStartTimeRef,
    durationIntervalRef,
    maxDurationTimeoutRef,
    setIsRecording,
    setIsTranscribing,
    setRecordingDuration,
    setStream,
    setTranscribedAudio,
    onExpiredCancel,
  } = options;

  setTranscribedAudio(null);
  cancelRequestedRef.current = false;
  // Flip recording state synchronously so the mic lights up red before
  // the browser's mic permission prompt resolves.
  setIsRecording(true);

  let userStream: MediaStream;
  try {
    userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast.error("Failed to access microphone");
    setIsRecording(false);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref mutated across the await by stopRecording/cancelRecording
  if (cancelRequestedRef.current) {
    cancelRequestedRef.current = false;
    userStream.getTracks().forEach((track) => track.stop());
    return;
  }

  setStream(userStream);
  const recorderFormat = pickRecorderFormat();
  if (!recorderFormat) {
    toast.error("Your browser can't record audio in a supported format");
    userStream.getTracks().forEach((track) => track.stop());
    setStream(null);
    setIsRecording(false);
    return;
  }

  const mediaRecorder = new MediaRecorder(userStream, {
    mimeType: recorderFormat.mimeType,
    audioBitsPerSecond: RECORDER_BITRATE,
  });
  mediaRecorderRef.current = mediaRecorder;

  mediaRecorder.ondataavailable = (event) => {
    audioChunksRef.current.push(event.data);
  };

  mediaRecorder.onstop = () => {
    clearTimerRefs(durationIntervalRef, maxDurationTimeoutRef);
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      audioChunksRef.current = [];
      setRecordingDuration(0);
      return;
    }
    void processTranscription({
      audioChunksRef,
      extension: recorderFormat.extension,
      mimeType: mediaRecorder.mimeType || recorderFormat.mimeType,
      recordingDuration,
      setIsTranscribing,
      setRecordingDuration,
      setStream,
      setTranscribedAudio,
    });
  };

  mediaRecorder.start();
  recordingStartTimeRef.current = Date.now();

  durationIntervalRef.current = setInterval(() => {
    if (recordingStartTimeRef.current) {
      const currentDuration = Date.now() - recordingStartTimeRef.current;
      setRecordingDuration(currentDuration);
    }
  }, 100);

  maxDurationTimeoutRef.current = setTimeout(
    () => {
      if (mediaRecorderRef.current?.state === "recording") {
        onExpiredCancel();
      }
    },
    (MAX_RECORDING_DURATION - 1) * 1000,
  );
}

export function useSpeechRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelRequestedRef = useRef(false);

  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [transcribedAudio, setTranscribedAudio] = useState<string | null>(null);

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stream?.getTracks().forEach((track) => track.stop());
      recordingStartTimeRef.current = null;
      clearTimerRefs(durationIntervalRef, maxDurationTimeoutRef);
      return;
    }
    // User hit stop during the optimistic window before getUserMedia resolved —
    // flag a cancel so the pending start aborts once permission returns.
    if (isRecording) {
      cancelRequestedRef.current = true;
      setIsRecording(false);
    }
  }

  function cancelRecording() {
    cancelRequestedRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setIsRecording(false);
    setRecordingDuration(0);
    recordingStartTimeRef.current = null;
    clearTimerRefs(durationIntervalRef, maxDurationTimeoutRef);
  }

  function startRecording() {
    void beginRecording({
      audioChunksRef,
      cancelRequestedRef,
      mediaRecorderRef,
      recordingDuration,
      recordingStartTimeRef,
      durationIntervalRef,
      maxDurationTimeoutRef,
      setIsRecording,
      setIsTranscribing,
      setRecordingDuration,
      setStream,
      setTranscribedAudio,
      onExpiredCancel: stopRecording,
    });
  }

  // eslint-disable-next-line no-restricted-syntax -- Cleanup effect syncs with MediaStream and timer APIs
  useEffect(() => {
    return () => {
      const durationIntervalRefHolder = durationIntervalRef;
      const maxDurationTimeoutRefHolder = maxDurationTimeoutRef;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (durationIntervalRefHolder.current) {
        clearInterval(durationIntervalRefHolder.current);
      }
      if (maxDurationTimeoutRefHolder.current) {
        clearTimeout(maxDurationTimeoutRefHolder.current);
      }
    };
  }, [stream]);

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording,
    transcribedAudio,
    isTranscribing,
  };
}
