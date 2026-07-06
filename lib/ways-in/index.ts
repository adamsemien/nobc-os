/** Ways-In access model (Stage 17, Phase A) - public surface.
 *
 *  The authored list is the source of truth (EventAccessModel); the gate
 *  tree is a compile artifact. Phase A ships the model, compiler, advanced
 *  flag, and derivation dark - the authoring UI and verbs are Phase B.
 */
export {
  PHASE_A_COMPILABLE,
  WAY_IN_REQUIREMENT_TYPES,
  compiledMapSchema,
  wayInRequirementSchema,
  wayInSchema,
  waysInListSchema,
} from "./schema";
export type { CompiledMap, WayIn, WayInRequirement, WayInRequirementType, WaysInList } from "./schema";
export { CompileError, compileWaysIn } from "./compile";
export { getAdvancedGateStatus, hashGateTree } from "./advanced";
export type { AdvancedGateStatus } from "./advanced";
export { mapCompiledTree, saveWaysIn } from "./save";
export type { SaveWaysInResult } from "./save";
export { deriveSatisfiedWayIn } from "./derive";
export type { SatisfiedWayIn, WayInDerivation } from "./derive";
