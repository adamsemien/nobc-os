/** Open condition-type registry (Stage 17).
 *
 *  Hard invariant: no condition type is usable until its server-side verifier
 *  exists and is tested. The contract makes `verify` mandatory; the registry
 *  test suite walks every registered def. Registration errors throw - that is
 *  an authoring/boot failure, never the grant path.
 */
import type { ConditionTypeDef } from "./types";

export class ConditionRegistry {
  private defs = new Map<string, ConditionTypeDef<unknown>>();

  register<C>(def: ConditionTypeDef<C>): void {
    if (this.defs.has(def.type)) {
      throw new Error(`Condition type already registered: ${def.type}`);
    }
    this.defs.set(def.type, def as ConditionTypeDef<unknown>);
  }

  get(type: string): ConditionTypeDef<unknown> | null {
    return this.defs.get(type) ?? null;
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  types(): string[] {
    return [...this.defs.keys()];
  }

  typeSet(): ReadonlySet<string> {
    return new Set(this.defs.keys());
  }
}

export function createConditionRegistry(
  defs: ConditionTypeDef<never>[] | ConditionTypeDef<unknown>[]
): ConditionRegistry {
  const registry = new ConditionRegistry();
  for (const def of defs as ConditionTypeDef<unknown>[]) registry.register(def);
  return registry;
}
