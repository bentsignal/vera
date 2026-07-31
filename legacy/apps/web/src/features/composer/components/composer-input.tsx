import { useRef } from "react";

import { useComposerInput } from "@acme/features/composer";
import { shortcuts } from "@acme/features/shortcuts";

import type { ComposerTextareaHandle } from "~/features/composer/primitives/composer-textarea";
import { ComposerTextarea } from "~/features/composer/primitives/composer-textarea";
import { useShortcut as useHotkey } from "~/features/shortcuts/hooks/use-shortcut";
import { useSendMessage } from "../hooks/use-send-message";

export function ComposerInput({
  showInstantLoad,
  handleError,
}: {
  showInstantLoad?: () => void;
  handleError?: () => void;
}) {
  const { value, setPrompt, disabled, placeholder } = useComposerInput();
  const { sendMessage } = useSendMessage();

  const handleRef = useRef<ComposerTextareaHandle>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage({ showInstantLoad, handleError });
    }
  }

  useHotkey({
    hotkey: shortcuts["focus-input"].hotkey,
    callback: () => handleRef.current?.focus(),
  });

  return (
    <ComposerTextarea
      ref={handleRef}
      value={value}
      onChange={setPrompt}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus
    />
  );
}
