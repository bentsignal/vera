import { useEffect } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";
import { useComposerStore } from "@acme/features/composer";

import { useSpeechRecording } from "./use-speech-recording";

export function useSpeech() {
  const appendPrompt = useComposerStore((state) => state.appendPrompt);

  const inProgress = useComposerStore((state) => state.storeIsRecording);

  // recording finished, waiting for transcription response from api
  const processing = useComposerStore(
    (state) => state.storeIsTranscribing === true,
  );

  // prevent users from starting a new transcription while
  // one is being processed, or after they have hit their limit
  const { data: limitHit } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.limitHit,
  });
  const disabled = limitHit || processing;

  const {
    transcribedAudio,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording,
    isTranscribing,
  } = useSpeechRecording();

  const setStoreIsTranscribing = useComposerStore(
    (state) => state.setStoreIsTranscribing,
  );
  const setStoreIsRecording = useComposerStore(
    (state) => state.setStoreIsRecording,
  );
  // eslint-disable-next-line no-restricted-syntax -- Syncs external recording state with the composer store
  useEffect(() => {
    setStoreIsRecording(isRecording);
    setStoreIsTranscribing(isTranscribing);
  }, [
    isRecording,
    isTranscribing,
    setStoreIsRecording,
    setStoreIsTranscribing,
  ]);

  // eslint-disable-next-line no-restricted-syntax -- Syncs transcription result with the prompt
  useEffect(() => {
    if (transcribedAudio?.trim()) {
      appendPrompt(transcribedAudio);
    }
  }, [transcribedAudio, appendPrompt]);

  return {
    startSpeech: startRecording,
    stopSpeech: stopRecording,
    cancelSpeech: cancelRecording,
    inProgress,
    processing,
    disabled,
  };
}

export type SpeechApi = ReturnType<typeof useSpeech>;
