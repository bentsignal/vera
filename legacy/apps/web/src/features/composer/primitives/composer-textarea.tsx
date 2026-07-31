import { useEffect, useImperativeHandle, useRef } from "react";

export interface ComposerTextareaHandle {
  focus: () => void;
}

export function ComposerTextarea({
  ref,
  value,
  onChange,
  onKeyDown,
  placeholder = "Aa",
  disabled,
  autoFocus,
}: {
  ref?: React.Ref<ComposerTextareaHandle>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function focusInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const length = el.value.length;
    el.setSelectionRange(length, length);
  }

  useImperativeHandle(ref, () => ({ focus: focusInput }), []);

  // eslint-disable-next-line no-restricted-syntax -- Syncs with DOM: imperatively resizes textarea height based on content scroll height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (value !== "") {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  // eslint-disable-next-line no-restricted-syntax -- Syncs with DOM: focuses the textarea on initial mount
  useEffect(() => {
    if (autoFocus) focusInput();
  }, [autoFocus]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      maxLength={20000}
      className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:ring-ring/0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent flex h-auto max-h-32 min-h-[36px] w-full min-w-0 resize-none overflow-y-auto py-2 text-base transition-[color,box-shadow] outline-none select-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 md:text-sm"
    />
  );
}
