const LINK_CLASS = "underline-offset-4 hover:underline focus-visible:underline";

export function Terms({
  tosURL,
  privacyURL,
}: {
  tosURL: string;
  privacyURL: string;
}) {
  return (
    <p className="text-muted-foreground/70 text-center text-[11px] leading-relaxed">
      By continuing you agree to our{" "}
      <a href={tosURL} className={LINK_CLASS}>
        Terms
      </a>{" "}
      &amp;{" "}
      <a href={privacyURL} className={LINK_CLASS}>
        Privacy Policy
      </a>
    </p>
  );
}
