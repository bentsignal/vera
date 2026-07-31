import type { Components } from "react-markdown";

import { Code } from "~/features/messages/components/code";

export const markdownComponents = {
  code: Code,
  pre: ({ children }) => <>{children}</>,
  hr: () => <></>,
  a: ({ children, ...props }) => {
    const text = typeof children === "string" ? children : "";
    if (text.startsWith("[") && text.endsWith("]")) {
      return (
        <a
          className="text-muted bg-muted-foreground rounded-sm px-1.5 py-0.5 text-xs no-underline"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {text.slice(1, -1)}
        </a>
      );
    }
    return (
      <a
        className="text-muted-foreground hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },
  // table: ({ children, ...props }) => {
  //   return (
  //     <div className="bg-card mt-6 mb-2 w-full overflow-hidden rounded-xl border">
  //       <table className="!m-0 w-full rounded-xl" {...props}>
  //         {children}
  //       </table>
  //     </div>
  //   );
  // },
  // tr: ({ children, ...props }) => {
  //   return (
  //     <tr className="!border-0" {...props}>
  //       {children}
  //     </tr>
  //   );
  // },
  // td: ({ children, ...props }) => {
  //   return (
  //     <td className="rounded-xl p-2 text-xs sm:p-4 sm:text-sm" {...props}>
  //       {children}
  //     </td>
  //   );
  // },
  // th: ({ children, ...props }) => {
  //   return (
  //     <th
  //       className="rounded-xl p-2 text-left text-sm font-bold sm:p-4 sm:text-lg"
  //       {...props}
  //     >
  //       {children}
  //     </th>
  //   );
  // },
  h1: ({ children, ...props }) => {
    return (
      <h1 className="mt-6 mb-2 text-3xl font-semibold" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    return (
      <h2 className="mt-6 mb-2 text-2xl font-semibold" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    return (
      <h3 className="mt-6 mb-2 text-xl font-semibold" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    return (
      <h4 className="mt-6 mb-2 text-lg font-semibold" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ children, ...props }) => {
    return (
      <h5 className="mt-6 mb-2 text-base font-semibold" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ children, ...props }) => {
    return (
      <h6 className="mt-6 mb-2 text-sm font-semibold" {...props}>
        {children}
      </h6>
    );
  },
} satisfies Partial<Components>;
