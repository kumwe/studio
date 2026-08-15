import type { BlockDefinition, BlockType } from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { assertStudioPropertySchema } from './schema-profile.js';

export interface BlockRegistrationOptions {
  verifiedIntegrity?: string;
}

export interface ResolvedBlockRegistration {
  definition: BlockDefinition;
  verifiedIntegrity?: string;
}

interface StoredBlockRegistration {
  definition: BlockDefinition;
  verifiedIntegrity?: string;
}

export class BlockRegistry {
  readonly #definitions = new Map<BlockType, Map<string, StoredBlockRegistration>>();

  public constructor(definitions: readonly BlockDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  public register(
    definition: BlockDefinition,
    options: Readonly<BlockRegistrationOptions> = {},
  ): void {
    assertStudioPropertySchema(definition.propertySchema);
    if (options.verifiedIntegrity !== undefined && !isIntegrity(options.verifiedIntegrity)) {
      throw new TypeError(
        'Host-verified block integrity must be a canonical SRI sha256/384/512 value.',
      );
    }

    let versions = this.#definitions.get(definition.type);
    if (versions === undefined) {
      versions = new Map<string, StoredBlockRegistration>();
      this.#definitions.set(definition.type, versions);
    }

    if (versions.has(definition.version)) {
      throw new Error(`Block ${definition.type}@${definition.version} is already registered.`);
    }

    const registration: StoredBlockRegistration = {
      definition: cloneContractValue(definition),
    };
    if (options.verifiedIntegrity !== undefined) {
      registration.verifiedIntegrity = options.verifiedIntegrity;
    }
    versions.set(definition.version, registration);
  }

  public resolve(type: BlockType, version: string): BlockDefinition | undefined {
    return this.resolveRegistration(type, version)?.definition;
  }

  public resolveRegistration(
    type: BlockType,
    version: string,
  ): ResolvedBlockRegistration | undefined {
    const registration = this.#definitions.get(type)?.get(version);
    if (registration === undefined) {
      return undefined;
    }
    const resolved: ResolvedBlockRegistration = {
      definition: cloneContractValue(registration.definition),
    };
    if (registration.verifiedIntegrity !== undefined) {
      resolved.verifiedIntegrity = registration.verifiedIntegrity;
    }
    return resolved;
  }

  public definitions(): BlockDefinition[] {
    return [...this.#definitions.values()]
      .flatMap((versions) => [...versions.values()])
      .map((registration) => cloneContractValue(registration.definition));
  }
}

function isIntegrity(value: string): boolean {
  return /^(?:sha256-[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{85}[AQgw]==)(?![\s\S])/u.test(
    value,
  );
}
