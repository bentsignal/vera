import type { Object3D } from "three";
import { Suspense, useRef } from "react";
import {
  defaultTouchPointerOpacity,
  PointerCursorModel,
  useTouchPointer,
  useXRInputSourceStateContext,
  XRHandModel,
  XRSpace,
} from "@react-three/xr";

export function CustomHand() {
  const state = useXRInputSourceStateContext("hand");
  const middleFingerRef = useRef<Object3D>(null);
  const pointer = useTouchPointer(middleFingerRef, state);
  const middleFingerTip = state.inputSource.hand.get("middle-finger-tip");
  if (!middleFingerTip) {
    throw new Error("middle-finger-tip joint not found on hand input source");
  }
  return (
    <>
      <XRSpace ref={middleFingerRef} space={middleFingerTip} />
      <Suspense>
        <XRHandModel />
      </Suspense>
      <PointerCursorModel
        pointer={pointer}
        opacity={defaultTouchPointerOpacity}
      />
    </>
  );
}
