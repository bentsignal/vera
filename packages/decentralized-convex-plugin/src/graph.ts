import type { AnyCapability } from "./capability.ts";
import type { AnyPlugin } from "./plugin.ts";

export type PluginGraphIssue =
  | {
      readonly capabilityId: string;
      readonly code: "duplicate-provider";
      readonly plugins: readonly string[];
    }
  | {
      readonly capabilityId: string;
      readonly code: "incompatible-version";
      readonly plugin: string;
      readonly providedVersions: readonly string[];
      readonly requiredVersion: string;
    }
  | {
      readonly capabilityId: string;
      readonly code: "missing-provider";
      readonly plugin: string;
      readonly requiredVersion: string;
    }
  | {
      readonly code: "dependency-cycle";
      readonly plugins: readonly string[];
    }
  | {
      readonly code: "duplicate-plugin-name";
      readonly name: string;
    };

interface ProviderCandidate {
  readonly capability: AnyCapability;
  readonly plugin: AnyPlugin;
}

type ProviderMap = ReadonlyMap<string, readonly ProviderCandidate[]>;
type PluginDependencies = ReadonlyMap<AnyPlugin, ReadonlySet<AnyPlugin>>;

interface GraphTraversal {
  readonly complete: Set<AnyPlugin>;
  readonly issues: PluginGraphIssue[];
  readonly order: AnyPlugin[];
  readonly reportedCycles: Set<string>;
  readonly stack: AnyPlugin[];
  readonly visiting: Set<AnyPlugin>;
}

export class PluginGraphError extends Error {
  readonly issues: readonly PluginGraphIssue[];

  constructor(issues: readonly PluginGraphIssue[]) {
    super(formatPluginGraphIssues(issues));
    this.name = "PluginGraphError";
    this.issues = issues;
  }
}

export function inspectPluginGraph(plugins: readonly AnyPlugin[]) {
  return analyzePluginGraph(plugins).issues;
}

export function assertPluginGraph(plugins: readonly AnyPlugin[]) {
  const analysis = analyzePluginGraph(plugins);
  if (analysis.issues.length > 0) {
    throw new PluginGraphError(analysis.issues);
  }
  return analysis.order;
}

function analyzePluginGraph(plugins: readonly AnyPlugin[]) {
  const issues = inspectDuplicatePluginNames(plugins);
  const providers = collectProviders(plugins);
  issues.push(...inspectDuplicateProviders(providers));
  const dependencies = collectDependencies({ issues, plugins, providers });
  const order = resolvePluginOrder({ dependencies, issues, plugins });
  return { issues, order };
}

function inspectDuplicatePluginNames(plugins: readonly AnyPlugin[]) {
  const issues = Array<PluginGraphIssue>();
  const pluginNames = new Set<string>();
  for (const plugin of plugins) {
    if (pluginNames.has(plugin.name)) {
      issues.push({ code: "duplicate-plugin-name", name: plugin.name });
    }
    pluginNames.add(plugin.name);
  }
  return issues;
}

function collectProviders(plugins: readonly AnyPlugin[]) {
  const providers = new Map<string, ProviderCandidate[]>();
  for (const plugin of plugins) {
    for (const capability of plugin.provides) {
      const candidates = providers.get(capability.id) ?? [];
      candidates.push({ capability, plugin });
      providers.set(capability.id, candidates);
    }
  }
  return providers;
}

function inspectDuplicateProviders(providers: ProviderMap) {
  const issues = Array<PluginGraphIssue>();
  for (const [capabilityId, candidates] of providers) {
    if (candidates.length > 1) {
      issues.push({
        capabilityId,
        code: "duplicate-provider",
        plugins: candidates.map(({ plugin }) => plugin.name),
      });
    }
  }
  return issues;
}

function collectDependencies({
  issues,
  plugins,
  providers,
}: {
  readonly issues: PluginGraphIssue[];
  readonly plugins: readonly AnyPlugin[];
  readonly providers: ProviderMap;
}) {
  const dependencies = new Map<AnyPlugin, Set<AnyPlugin>>(
    plugins.map((plugin) => [plugin, new Set()]),
  );

  for (const plugin of plugins) {
    for (const requirement of plugin.requires) {
      const provider = resolveProvider({
        issues,
        plugin,
        providers,
        requirement,
      });
      if (provider) {
        dependencies.get(plugin)?.add(provider);
      }
    }
  }
  return dependencies;
}

function resolveProvider({
  issues,
  plugin,
  providers,
  requirement,
}: {
  readonly issues: PluginGraphIssue[];
  readonly plugin: AnyPlugin;
  readonly providers: ProviderMap;
  readonly requirement: AnyCapability;
}) {
  const candidates = providers.get(requirement.id) ?? [];
  if (candidates.length === 0) {
    issues.push({
      capabilityId: requirement.id,
      code: "missing-provider",
      plugin: plugin.name,
      requiredVersion: requirement.version,
    });
    return undefined;
  }

  const matching = candidates.find(
    ({ capability }) => capability.version === requirement.version,
  );
  if (!matching) {
    issues.push({
      capabilityId: requirement.id,
      code: "incompatible-version",
      plugin: plugin.name,
      providedVersions: candidates.map(({ capability }) => capability.version),
      requiredVersion: requirement.version,
    });
  }
  return matching?.plugin;
}

function resolvePluginOrder({
  dependencies,
  issues,
  plugins,
}: {
  readonly dependencies: PluginDependencies;
  readonly issues: PluginGraphIssue[];
  readonly plugins: readonly AnyPlugin[];
}) {
  const traversal: GraphTraversal = {
    complete: new Set(),
    issues,
    order: [],
    reportedCycles: new Set(),
    stack: [],
    visiting: new Set(),
  };
  for (const plugin of plugins) {
    visitPlugin({ dependencies, plugin, traversal });
  }
  return traversal.order;
}

function visitPlugin({
  dependencies,
  plugin,
  traversal,
}: {
  readonly dependencies: PluginDependencies;
  readonly plugin: AnyPlugin;
  readonly traversal: GraphTraversal;
}) {
  if (traversal.complete.has(plugin)) {
    return;
  }
  if (traversal.visiting.has(plugin)) {
    reportDependencyCycle(plugin, traversal);
    return;
  }

  traversal.visiting.add(plugin);
  traversal.stack.push(plugin);
  for (const dependency of dependencies.get(plugin) ?? []) {
    visitPlugin({ dependencies, plugin: dependency, traversal });
  }
  traversal.stack.pop();
  traversal.visiting.delete(plugin);
  traversal.complete.add(plugin);
  traversal.order.push(plugin);
}

function reportDependencyCycle(plugin: AnyPlugin, traversal: GraphTraversal) {
  const cycleStart = traversal.stack.indexOf(plugin);
  const cycle = [...traversal.stack.slice(cycleStart), plugin].map(
    ({ name }) => name,
  );
  const key = [...new Set(cycle)].sort().join("|");
  if (!traversal.reportedCycles.has(key)) {
    traversal.issues.push({ code: "dependency-cycle", plugins: cycle });
    traversal.reportedCycles.add(key);
  }
}

function formatPluginGraphIssues(issues: readonly PluginGraphIssue[]) {
  const details = issues.map((issue) => {
    switch (issue.code) {
      case "dependency-cycle":
        return `dependency cycle: ${issue.plugins.join(" -> ")}`;
      case "duplicate-plugin-name":
        return `duplicate plugin name: ${issue.name}`;
      case "duplicate-provider":
        return `multiple plugins provide ${issue.capabilityId}: ${issue.plugins.join(", ")}`;
      case "incompatible-version":
        return `${issue.plugin} requires ${issue.capabilityId}@${issue.requiredVersion}, available: ${issue.providedVersions.join(", ")}`;
      case "missing-provider":
        return `${issue.plugin} requires missing ${issue.capabilityId}@${issue.requiredVersion}`;
    }
  });
  return `Invalid plugin graph:\n- ${details.join("\n- ")}`;
}
