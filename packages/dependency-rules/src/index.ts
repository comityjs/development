export type {
  BuildOptions,
  DependencyCruiserConfig,
  DependencyRule,
} from "./build-config.js";
export type { PackageRecord } from "./classify.js";
export type { LayerName, LayerSets } from "./constants.js";

export {
  buildDependencyRules,
  buildDependencyRulesForRoot,
} from "./build-config.js";
export { classifyByLayer, layerSetsFromPackages } from "./classify.js";
export { DEFAULT_REPOSITORY_FACTS, LAYER_PROFILES } from "./constants.js";
