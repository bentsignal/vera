import { useState } from "react";
import { Textarea } from "@react-three/uikit";

import { useComposerInput } from "@acme/features/composer";

import { hexColors } from "~/styles/styles";

export function XRComposerInput() {
  const { value, setPrompt, disabled, placeholder } = useComposerInput();
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Textarea
      value={isFocused ? value : value || placeholder}
      onValueChange={(value) => {
        setPrompt(value);
      }}
      width={"100%"}
      height={"100%"}
      color={disabled ? hexColors.borderInput : hexColors.foreground}
      onFocusChange={(focus) => {
        setIsFocused(focus);
        if (focus && (value === "" || value === placeholder)) {
          setPrompt("");
        } else if (!focus && value === "") {
          setPrompt(placeholder);
        }
      }}
      disabled={disabled}
    />
  );
}
