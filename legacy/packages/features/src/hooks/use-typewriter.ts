import { useEffect, useRef, useState } from "react";

const FPS = 100;
const TICK_MS = 1000 / FPS;

interface Snapshot {
  length: number;
  timestamp: number;
}

export function useTypewriter({
  inputText,
  streaming,
}: {
  inputText: string;
  streaming: boolean;
}) {
  const [visibleText, setVisibleText] = useState("");

  // Keep the latest inputText available inside the interval without
  // re-running the effect on every delta (which used to reset the snapshot
  // before growth could ever be measured).
  const inputRef = useRef(inputText);
  const snapshot = useRef<Snapshot | null>(null);
  const growthRate = useRef(0);

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to sync latest inputText into ref read by the interval tick
  useEffect(() => {
    inputRef.current = inputText;
  }, [inputText]);

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to drive typewriter animation via setInterval
  useEffect(() => {
    if (!streaming) {
      snapshot.current = null;
      return;
    }

    snapshot.current = {
      length: inputRef.current.length,
      timestamp: Date.now(),
    };

    const interval = setInterval(() => {
      const currentInput = inputRef.current;
      const snap = snapshot.current;
      if (snap && currentInput.length > snap.length) {
        const delta = Date.now() - snap.timestamp;
        if (delta > 0) {
          const growth = currentInput.length - snap.length;
          growthRate.current = (growth / delta) * TICK_MS;
        }
        snap.length = currentInput.length;
        snap.timestamp = Date.now();
      }

      setVisibleText((current) => {
        if (current.length >= currentInput.length) {
          return currentInput;
        }
        const step = Math.max(growthRate.current, 1);
        const nextIndex = Math.min(current.length + step, currentInput.length);
        return currentInput.slice(0, nextIndex);
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [streaming]);

  if (!streaming) {
    return { animatedText: inputText };
  }

  return { animatedText: visibleText };
}
