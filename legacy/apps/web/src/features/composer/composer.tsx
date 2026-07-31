import { ComposerSpeech } from "~/features/speech/components/composer-speech";
import { ComposerSpeechCancel } from "~/features/speech/components/composer-speech-cancel";
import { useSpeech } from "~/features/speech/hooks/use-speech";
import { ComposerAddAttachments } from "./components/composer-add-attachments";
import { ComposerAttachmentsPreview } from "./components/composer-attachments-preview";
import { ComposerInput } from "./components/composer-input";
import { ComposerSend } from "./components/composer-send";
import { ComposerShell } from "./primitives/composer-shell";

export function Composer({
  showInstantLoad,
  handleError,
}: {
  showInstantLoad?: () => void;
  handleError?: () => void;
}) {
  const speech = useSpeech();

  return (
    <ComposerShell
      attachments={<ComposerAttachmentsPreview />}
      input={
        <ComposerInput
          showInstantLoad={showInstantLoad}
          handleError={handleError}
        />
      }
      actions={
        <>
          <div className="flex flex-1 items-center justify-start gap-2">
            {!speech.inProgress && <ComposerAddAttachments />}
            <ComposerSpeech speech={speech} />
          </div>
          {speech.inProgress ? (
            <ComposerSpeechCancel onClick={speech.cancelSpeech} />
          ) : (
            <ComposerSend
              showInstantLoad={showInstantLoad}
              handleError={handleError}
            />
          )}
        </>
      }
    />
  );
}
