import { getNoticeMessage, NoticeCode } from "@acme/features/messages";

import { QuickLink as Link } from "~/features/quick-link/quick-link";

export function NoticeMessage({ code }: { code: NoticeCode }) {
  return (
    <div className="flex w-full items-center gap-1">
      <div className="flex justify-start gap-2">
        <span className="text-muted-foreground">
          {getNoticeMessage(code)}
          {code === NoticeCode.PremiumRequired ? (
            <>
              {" "}
              <Link to="/pricing" className="text-premium underline">
                View Plans.
              </Link>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
