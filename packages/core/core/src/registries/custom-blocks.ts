import { has } from 'lodash';
import { yup } from '@strapi/utils';

import type { Core, Modules } from '@strapi/types';

import { customBlockValidatorHelpers } from '../services/entity-validator/blocks-validator';

/**
 * Node types handled by the core blocks validator. They cannot be registered as custom blocks,
 * so the validation of built-in nodes never changes.
 */
export const BUILT_IN_BLOCK_NODE_TYPES = [
  'paragraph',
  'heading',
  'quote',
  'list',
  'list-item',
  'image',
  'code',
  'text',
  'link',
] as const;

const customBlocksRegistry = (strapi: Core.Strapi) => {
  // Keyed by uid (`plugin::<plugin>.<name>` or `global::<name>`), like custom fields
  const customBlocks: Record<string, Modules.CustomBlocks.CustomBlockServerOptions> = {};
  // Keyed by node type. Stored nodes only carry `type`, so a type can only have one owner.
  const uidsByType = new Map<string, string>();
  // Keyed by node type. Built once, when the block is registered.
  const schemasByType = new Map<string, yup.AnySchema>();

  return {
    getAll() {
      return customBlocks;
    },
    get(uid: string) {
      const registeredCustomBlock = customBlocks[uid];
      if (!registeredCustomBlock) {
        throw new Error(`Could not find Custom Block: ${uid}`);
      }

      return registeredCustomBlock;
    },
    /**
     * Returns the options of the custom block registered for a node type, or undefined
     */
    getByType(type: unknown) {
      const uid = typeof type === 'string' ? uidsByType.get(type) : undefined;

      return uid ? customBlocks[uid] : undefined;
    },
    /**
     * Returns the validation schema of the custom block registered for a node type, or undefined
     */
    getSchemaByType(type: unknown) {
      return typeof type === 'string' ? schemasByType.get(type) : undefined;
    },
    add(
      customBlock:
        | Modules.CustomBlocks.CustomBlockServerOptions
        | Modules.CustomBlocks.CustomBlockServerOptions[]
    ) {
      const customBlockList = Array.isArray(customBlock) ? customBlock : [customBlock];

      for (const cb of customBlockList) {
        if (!has(cb, 'name') || !has(cb, 'validator')) {
          throw new Error(`Custom blocks require a 'name' and 'validator' key`);
        }

        const { name, plugin, validator } = cb;

        if (typeof validator !== 'function') {
          throw new Error(`Custom block validator must be a function that returns a Yup schema`);
        }

        const isValidObjectKey = /^(?![0-9])[a-zA-Z0-9$_-]+$/;
        if (typeof name !== 'string' || !isValidObjectKey.test(name)) {
          throw new Error(`Custom block name: '${name}' is not a valid object key`);
        }

        if ((BUILT_IN_BLOCK_NODE_TYPES as readonly string[]).includes(name)) {
          throw new Error(`Custom block name: '${name}' is a built-in block node type`);
        }

        // When no plugin is specified, or it isn't found in Strapi, default to global
        const uid =
          plugin && strapi.plugin(plugin) ? `plugin::${plugin}.${name}` : `global::${name}`;

        if (has(customBlocks, uid)) {
          throw new Error(`Custom block: '${uid}' has already been registered`);
        }

        if (uidsByType.has(name)) {
          throw new Error(
            `Custom block type: '${name}' has already been registered by '${uidsByType.get(name)}'`
          );
        }

        // Build the schema now so a broken validator fails at startup, not during a request
        const schema = validator(customBlockValidatorHelpers);
        if (!yup.isSchema(schema)) {
          throw new Error(`Custom block validator for '${uid}' must return a Yup schema`);
        }

        customBlocks[uid] = cb;
        uidsByType.set(name, uid);
        schemasByType.set(name, schema as yup.AnySchema);
      }
    },
  };
};

export default customBlocksRegistry;
