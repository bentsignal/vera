// heic-decode ships no types. Only what assistantImagesNode.ts uses.
declare module "heic-decode" {
  interface DecodedImage {
    readonly data: Uint8ClampedArray;
    readonly height: number;
    readonly width: number;
  }
  interface LazyImage {
    readonly height: number;
    readonly width: number;
    decode: () => Promise<DecodedImage>;
  }
  function decode(input: { buffer: Uint8Array }): Promise<DecodedImage>;
  namespace decode {
    function all(input: {
      buffer: Uint8Array;
    }): Promise<LazyImage[] & { dispose: () => void }>;
  }
  export default decode;
}
