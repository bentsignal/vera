export interface ProtocolGraphNode {
  readonly name: string;
  readonly requires: Readonly<Record<string, string>>;
  readonly version: string;
}

type RequirementEntries<Protocol extends ProtocolGraphNode> = {
  readonly [Name in keyof Protocol["requires"] & string]: {
    readonly name: Name;
    readonly plugin: Protocol["name"];
    readonly version: Protocol["requires"][Name];
  };
}[keyof Protocol["requires"] & string];

type RequirementsFromUnion<Protocol extends ProtocolGraphNode> =
  Protocol extends ProtocolGraphNode ? RequirementEntries<Protocol> : never;

type AllRequirements<Protocols extends readonly ProtocolGraphNode[]> =
  RequirementsFromUnion<Protocols[number]>;

type MatchingProtocolFromUnion<
  Protocol extends ProtocolGraphNode,
  Requirement extends { readonly name: string; readonly version: string },
> = Protocol extends ProtocolGraphNode
  ? Protocol["name"] extends Requirement["name"]
    ? Protocol["version"] extends Requirement["version"]
      ? Protocol
      : never
    : never
  : never;

type MatchingProtocol<
  Requirement extends { readonly name: string; readonly version: string },
  Protocols extends readonly ProtocolGraphNode[],
> = MatchingProtocolFromUnion<Protocols[number], Requirement>;

type SameNameProtocolFromUnion<
  Protocol extends ProtocolGraphNode,
  Requirement extends { readonly name: string },
> = Protocol extends ProtocolGraphNode
  ? Protocol["name"] extends Requirement["name"]
    ? Protocol
    : never
  : never;

type SameNameProtocol<
  Requirement extends { readonly name: string },
  Protocols extends readonly ProtocolGraphNode[],
> = SameNameProtocolFromUnion<Protocols[number], Requirement>;

type MissingRequirements<Protocols extends readonly ProtocolGraphNode[]> =
  AllRequirements<Protocols> extends infer Requirement extends {
    readonly name: string;
    readonly plugin: string;
    readonly version: string;
  }
    ? [MatchingProtocol<Requirement, Protocols>] extends [never]
      ? [SameNameProtocol<Requirement, Protocols>] extends [never]
        ? `${Requirement["plugin"]} requires ${Requirement["name"]}@${Requirement["version"]}`
        : never
      : never
    : never;

type IncompatibleRequirements<Protocols extends readonly ProtocolGraphNode[]> =
  AllRequirements<Protocols> extends infer Requirement extends {
    readonly name: string;
    readonly plugin: string;
    readonly version: string;
  }
    ? [MatchingProtocol<Requirement, Protocols>] extends [never]
      ? [SameNameProtocol<Requirement, Protocols>] extends [never]
        ? never
        : `${Requirement["plugin"]} requires ${Requirement["name"]}@${Requirement["version"]}`
      : never
    : never;

type DuplicateProtocolNames<
  Protocols extends readonly ProtocolGraphNode[],
  Seen extends string = never,
> = Protocols extends readonly [
  infer Head extends ProtocolGraphNode,
  ...infer Tail extends readonly ProtocolGraphNode[],
]
  ? Head["name"] extends Seen
    ? Head["name"] | DuplicateProtocolNames<Tail, Seen>
    : DuplicateProtocolNames<Tail, Seen | Head["name"]>
  : never;

export type ProtocolGraphConstraint<
  Protocols extends readonly ProtocolGraphNode[],
> = Protocols &
  ([MissingRequirements<Protocols>] extends [never]
    ? unknown
    : {
        readonly __missingPluginRequirements: MissingRequirements<Protocols>;
      }) &
  ([IncompatibleRequirements<Protocols>] extends [never]
    ? unknown
    : {
        readonly __incompatiblePluginRequirements: IncompatibleRequirements<Protocols>;
      }) &
  ([DuplicateProtocolNames<Protocols>] extends [never]
    ? unknown
    : {
        readonly __duplicatePluginNames: DuplicateProtocolNames<Protocols>;
      });

export type ProtocolGraphIssue =
  | {
      readonly code: "dependency-cycle";
      readonly plugins: readonly string[];
    }
  | {
      readonly code: "duplicate-plugin-name";
      readonly name: string;
    }
  | {
      readonly code: "incompatible-version";
      readonly plugin: string;
      readonly providedVersion: string;
      readonly requiredPlugin: string;
      readonly requiredVersion: string;
    }
  | {
      readonly code: "missing-plugin";
      readonly plugin: string;
      readonly requiredPlugin: string;
      readonly requiredVersion: string;
    };

export class ProtocolGraphError extends Error {
  readonly issues: readonly ProtocolGraphIssue[];

  constructor(issues: readonly ProtocolGraphIssue[]) {
    super(formatIssues(issues));
    this.name = "ProtocolGraphError";
    this.issues = issues;
  }
}

export function defineProtocolSet<
  const Protocols extends readonly ProtocolGraphNode[],
>(...protocols: ProtocolGraphConstraint<Protocols>): Protocols {
  assertProtocolGraph(protocols);
  Object.freeze(protocols);
  return protocols;
}

export function inspectProtocolGraph(
  protocols: readonly ProtocolGraphNode[],
): readonly ProtocolGraphIssue[] {
  return analyze(protocols).issues;
}

export function assertProtocolGraph<
  const Protocols extends readonly ProtocolGraphNode[],
>(protocols: Protocols): readonly Protocols[number][] {
  const analysis = analyze(protocols);
  if (analysis.issues.length > 0) {
    throw new ProtocolGraphError(analysis.issues);
  }
  return analysis.order;
}

function analyze(protocols: readonly ProtocolGraphNode[]) {
  const issues: ProtocolGraphIssue[] = [];
  const byName = new Map<string, ProtocolGraphNode>();
  for (const protocol of protocols) {
    if (byName.has(protocol.name)) {
      issues.push({ code: "duplicate-plugin-name", name: protocol.name });
    } else {
      byName.set(protocol.name, protocol);
    }
  }

  const dependencies = new Map<ProtocolGraphNode, ProtocolGraphNode[]>();
  for (const protocol of protocols) {
    const resolved: ProtocolGraphNode[] = [];
    for (const [requiredPlugin, requiredVersion] of Object.entries(
      protocol.requires,
    )) {
      const dependency = byName.get(requiredPlugin);
      if (dependency === undefined) {
        issues.push({
          code: "missing-plugin",
          plugin: protocol.name,
          requiredPlugin,
          requiredVersion,
        });
      } else if (dependency.version !== requiredVersion) {
        issues.push({
          code: "incompatible-version",
          plugin: protocol.name,
          providedVersion: dependency.version,
          requiredPlugin,
          requiredVersion,
        });
      } else {
        resolved.push(dependency);
      }
    }
    dependencies.set(protocol, resolved);
  }

  const order: ProtocolGraphNode[] = [];
  const complete = new Set<ProtocolGraphNode>();
  const visiting = new Set<ProtocolGraphNode>();
  const stack: ProtocolGraphNode[] = [];
  const reportedCycles = new Set<string>();

  function visit(protocol: ProtocolGraphNode) {
    if (complete.has(protocol)) return;
    if (visiting.has(protocol)) {
      const start = stack.indexOf(protocol);
      const cycle = [...stack.slice(start), protocol].map(({ name }) => name);
      const key = [...new Set(cycle)].sort().join("|");
      if (!reportedCycles.has(key)) {
        issues.push({ code: "dependency-cycle", plugins: cycle });
        reportedCycles.add(key);
      }
      return;
    }

    visiting.add(protocol);
    stack.push(protocol);
    for (const dependency of dependencies.get(protocol) ?? [])
      visit(dependency);
    stack.pop();
    visiting.delete(protocol);
    complete.add(protocol);
    order.push(protocol);
  }

  for (const protocol of protocols) visit(protocol);
  return { issues, order };
}

function formatIssues(issues: readonly ProtocolGraphIssue[]) {
  const details = issues.map((issue) => {
    switch (issue.code) {
      case "dependency-cycle":
        return `dependency cycle: ${issue.plugins.join(" -> ")}`;
      case "duplicate-plugin-name":
        return `duplicate plugin name: ${issue.name}`;
      case "incompatible-version":
        return `${issue.plugin} requires ${issue.requiredPlugin}@${issue.requiredVersion}, installed: ${issue.providedVersion}`;
      case "missing-plugin":
        return `${issue.plugin} requires missing ${issue.requiredPlugin}@${issue.requiredVersion}`;
    }
  });
  return `Invalid plugin graph:\n- ${details.join("\n- ")}`;
}
