import { describe, it, expect, vi } from 'vitest';
import { yup } from '@strapi/utils';
import customBlocksRegistry from '../custom-blocks';

const strapi = {
  plugins: { plugintest: 'foo', otherplugin: 'bar' },
  plugin: vi.fn((plugin) => strapi.plugins[plugin]),
} as any;

const validator = () => yup.object().shape({ type: yup.string().equals(['callout']).required() });

describe('Custom blocks registry', () => {
  describe('add', () => {
    it('adds a custom block registered in a plugin', () => {
      const mockCB = { name: 'callout', plugin: 'plugintest', validator };

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add(mockCB);

      expect(customBlocks.getAll()).toEqual({ 'plugin::plugintest.callout': mockCB });
    });

    it('adds a custom block not registered in a plugin', () => {
      const mockCB = { name: 'callout', validator };

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add(mockCB);

      expect(customBlocks.getAll()).toEqual({ 'global::callout': mockCB });
    });

    it('adds a list of custom blocks', () => {
      const table = { name: 'table', plugin: 'plugintest', validator };
      const callout = { name: 'callout', plugin: 'plugintest', validator };

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add([table, callout]);

      expect(customBlocks.getAll()).toEqual({
        'plugin::plugintest.table': table,
        'plugin::plugintest.callout': callout,
      });
    });

    it('requires a name key on the custom block', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() => customBlocks.add({ validator } as any)).toThrowError(
        `Custom blocks require a 'name' and 'validator' key`
      );
    });

    it('requires a validator key on the custom block', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() => customBlocks.add({ name: 'callout' } as any)).toThrowError(
        `Custom blocks require a 'name' and 'validator' key`
      );
    });

    it('requires the validator to be a function', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() =>
        customBlocks.add({ name: 'callout', validator: yup.object() } as any)
      ).toThrowError(`Custom block validator must be a function that returns a Yup schema`);
    });

    it('requires the validator to return a Yup schema', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() =>
        customBlocks.add({ name: 'callout', plugin: 'plugintest', validator: () => ({}) as any })
      ).toThrowError(
        `Custom block validator for 'plugin::plugintest.callout' must return a Yup schema`
      );
      expect(customBlocks.getAll()).toEqual({});
    });

    it('passes the built-in node validators to the validator function', () => {
      const validatorFactory = vi.fn(validator);

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'callout', validator: validatorFactory });

      expect(validatorFactory).toHaveBeenCalledWith({
        textNodeValidator: expect.anything(),
        linkNodeValidator: expect.anything(),
        inlineNodeValidator: expect.anything(),
        blockNodeValidator: expect.anything(),
        checkValidLink: expect.any(Function),
      });
    });

    it('validates the name can be used as an object key', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() => customBlocks.add({ name: 'call.out', validator })).toThrowError(
        `Custom block name: 'call.out' is not a valid object key`
      );
      expect(() => customBlocks.add({ name: '1callout', validator })).toThrowError(
        `Custom block name: '1callout' is not a valid object key`
      );
    });

    it('accepts hyphenated names such as table-row', () => {
      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'table-row', validator });

      expect(customBlocks.getByType('table-row')).toBeDefined();
    });

    it.each([
      'paragraph',
      'heading',
      'quote',
      'list',
      'list-item',
      'image',
      'code',
      'text',
      'link',
    ])('does not allow overriding the built-in %s node', (name) => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() => customBlocks.add({ name, validator })).toThrowError(
        `Custom block name: '${name}' is a built-in block node type`
      );
    });

    it('does not allow a duplicate uid', () => {
      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'callout', plugin: 'plugintest', validator });

      expect(() =>
        customBlocks.add({ name: 'callout', plugin: 'plugintest', validator })
      ).toThrowError(`Custom block: 'plugin::plugintest.callout' has already been registered`);
    });

    it('does not allow two plugins to register the same node type', () => {
      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'callout', plugin: 'plugintest', validator });

      expect(() =>
        customBlocks.add({ name: 'callout', plugin: 'otherplugin', validator })
      ).toThrowError(
        `Custom block type: 'callout' has already been registered by 'plugin::plugintest.callout'`
      );
    });
  });

  describe('get', () => {
    it('gets a registered custom block by uid', () => {
      const mockCB = { name: 'callout', plugin: 'plugintest', validator };

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add(mockCB);

      expect(customBlocks.get('plugin::plugintest.callout')).toEqual(mockCB);
    });

    it('throws when the custom block is not found', () => {
      const customBlocks = customBlocksRegistry(strapi);

      expect(() => customBlocks.get('plugin::plugintest.callout')).toThrowError(
        `Could not find Custom Block: plugin::plugintest.callout`
      );
    });
  });

  describe('getSchemaByType', () => {
    it('gets the schema built for a node type', () => {
      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'callout', validator });

      expect(yup.isSchema(customBlocks.getSchemaByType('callout'))).toBe(true);
      expect(customBlocks.getSchemaByType('table')).toBeUndefined();
      expect(customBlocks.getSchemaByType(undefined)).toBeUndefined();
    });
  });

  describe('getByType', () => {
    it('gets a registered custom block by node type', () => {
      const mockCB = { name: 'callout', plugin: 'plugintest', validator };

      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add(mockCB);

      expect(customBlocks.getByType('callout')).toBe(mockCB);
    });

    it('returns undefined for unknown or non-string types', () => {
      const customBlocks = customBlocksRegistry(strapi);
      customBlocks.add({ name: 'callout', validator });

      expect(customBlocks.getByType('table')).toBeUndefined();
      expect(customBlocks.getByType(undefined)).toBeUndefined();
      expect(customBlocks.getByType({})).toBeUndefined();
      expect(customBlocks.getByType('constructor')).toBeUndefined();
      expect(customBlocks.getByType('__proto__')).toBeUndefined();
    });
  });
});
