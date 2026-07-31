import { cn } from "~/lib/utils";

const blurValues = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
};

export function Abyss({
  top = true,
  bottom = true,
  height = 100,
  blur = "sm",
}: {
  /** whether to show the top gradient. default: true */
  top?: boolean;
  /** whether to show the bottom gradient. default: true */
  bottom?: boolean;
  /** height in px. default: 100 */
  height?: number | string;
  /** blur amount: sm, md, lg, xl. default: sm */
  blur?: keyof typeof blurValues;
}) {
  const base = `w-full left-0 absolute z-10 pointer-events-none from-transparent`;
  return (
    <>
      {top && (
        <div
          className={cn(
            base,
            blurValues[blur],
            "top-0 bg-linear-to-t mask-b-from-30% mask-b-to-100%",
          )}
          style={{
            height: `${height}px`,
          }}
        />
      )}
      {bottom && (
        <div
          className={cn(
            base,
            blurValues[blur],
            "bottom-0 bg-linear-to-b mask-t-from-30% mask-t-to-100%",
          )}
          style={{
            height: `${height}px`,
          }}
        />
      )}
    </>
  );
}
