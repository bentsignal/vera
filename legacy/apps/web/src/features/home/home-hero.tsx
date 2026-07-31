import { Logo } from "~/components/logo";

const DEFAULT_TITLE = "Welcome back";
const DEFAULT_SUB_TITLE = "How can I help you today?";

export function HomeHero({
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUB_TITLE,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <>
      <Logo className="my-2" />
      <div className="my-2 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{title}</span>
        </div>
        <span className="text-muted-foreground text-lg font-semibold">
          {subtitle}
        </span>
      </div>
    </>
  );
}
