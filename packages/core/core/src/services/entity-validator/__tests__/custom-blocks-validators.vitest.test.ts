import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as strapiUtils from '@strapi/utils';
import type { Schema, Modules } from '@strapi/types';

import entityValidator from '..';
import { Validators } from '../validators';
import customBlocksRegistry from '../../../registries/custom-blocks';

const { errors, yup } = strapiUtils;

const paragraph = { type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] };

const callout = {
  type: 'callout',
  variant: 'warning',
  children: [
    { type: 'text', text: 'Heads up, ' },
    { type: 'link', url: 'https://strapi.io', children: [{ type: 'text', text: 'read this' }] },
  ],
};

const calloutBlock: Modules.CustomBlocks.CustomBlockServerOptions = {
  name: 'callout',
  plugin: 'blocks-test',
  validator: ({ inlineNodeValidator }) =>
    yup.object().shape({
      type: yup.string().equals(['callout']).required(),
      variant: yup.string().oneOf(['info', 'warning']).required(),
      children: yup.array().of(inlineNodeValidator).min(1).required(),
    }),
};

// A container block whose children are other blocks (built-in or custom)
const sectionBlock: Modules.CustomBlocks.CustomBlockServerOptions = {
  name: 'section',
  plugin: 'blocks-test',
  validator: ({ blockNodeValidator }) =>
    yup.object().shape({
      type: yup.string().equals(['section']).required(),
      children: yup.array().of(blockNodeValidator).min(1).required(),
    }),
};

// A compound block: only `table` is a block node, rows and cells are described by its schema
const tableBlock: Modules.CustomBlocks.CustomBlockServerOptions = {
  name: 'table',
  plugin: 'blocks-test',
  validator({ inlineNodeValidator }) {
    const cell = yup.object().shape({
      type: yup.string().equals(['table-cell']).required(),
      children: yup.array().of(inlineNodeValidator).required(),
    });
    const row = yup.object().shape({
      type: yup.string().equals(['table-row']).required(),
      children: yup.array().of(cell).min(1).required(),
    });

    return yup.object().shape({
      type: yup.string().equals(['table']).required(),
      children: yup.array().of(row).min(1).required(),
    });
  },
};

const table = {
  type: 'table',
  children: [
    {
      type: 'table-row',
      children: [
        { type: 'table-cell', children: [{ type: 'text', text: 'A1' }] },
        { type: 'table-cell', children: [{ type: 'text', text: 'B1' }] },
      ],
    },
  ],
};

const strapiPlugins: Record<string, unknown> = { 'blocks-test': {} };

const setupStrapi = (blocks: Modules.CustomBlocks.CustomBlockServerOptions[]) => {
  const registry = customBlocksRegistry({
    plugin: (name: string) => strapiPlugins[name],
  } as any);
  registry.add(blocks);

  global.strapi = {
    has: (name: string) => name === 'custom-blocks',
    get(name: string) {
      if (name === 'custom-blocks') {
        return registry;
      }
      throw new Error(`Unexpected container lookup: ${name}`);
    },
    errors: { badRequest: vi.fn() },
    getModel: () => model,
  } as any;
};

const createBlocksValidator = () =>
  strapiUtils.validateYupSchema(
    Validators.blocks({ attr: { type: 'blocks' } } as any, { isDraft: false })
  );

const model: Schema.ContentType = {
  modelType: 'contentType',
  uid: 'api::article.article',
  kind: 'collectionType',
  modelName: 'article',
  globalId: 'Article',
  info: { displayName: 'Article', singularName: 'article', pluralName: 'articles' },
  options: { draftAndPublish: true },
  attributes: {
    body: { type: 'blocks' },
  },
};

describe('Blocks validator with custom blocks', () => {
  const originalStrapi = global.strapi;

  beforeEach(() => {
    setupStrapi([calloutBlock, sectionBlock, tableBlock]);
  });

  afterAll(() => {
    global.strapi = originalStrapi;
  });

  describe('Unregistered types', () => {
    it('Should reject an unregistered block type', async () => {
      const validator = createBlocksValidator();

      await expect(
        validator([paragraph, { type: 'banner', children: [{ type: 'text', text: 'x' }] }])
      ).rejects.toThrow('Block node is of invalid type');
    });

    it('Should reject a custom block type when no Strapi instance is available', async () => {
      global.strapi = undefined as any;
      const validator = createBlocksValidator();

      await expect(validator([callout])).rejects.toThrow('Block node is of invalid type');
    });

    it('Should reject a custom block type when nothing is registered', async () => {
      setupStrapi([]);
      const validator = createBlocksValidator();

      await expect(validator([callout])).rejects.toThrow('Block node is of invalid type');
    });

    it('Should not treat structural child types of a custom block as block nodes', async () => {
      const validator = createBlocksValidator();

      await expect(validator([table.children[0]])).rejects.toThrow('Block node is of invalid type');
    });
  });

  describe('Registered types', () => {
    it('Should accept a registered block with inline children', async () => {
      const validator = createBlocksValidator();

      expect(await validator([paragraph, callout])).toEqual([paragraph, callout]);
    });

    it('Should reject invalid data in a registered block', async () => {
      const validator = createBlocksValidator();

      // Missing required attribute
      await expect(
        validator([{ type: 'callout', children: [{ type: 'text', text: 'x' }] }])
      ).rejects.toThrow(errors.YupValidationError);
      // Attribute out of range
      await expect(validator([{ ...callout, variant: 'danger' }])).rejects.toThrow(
        errors.YupValidationError
      );
      // Empty children
      await expect(validator([{ ...callout, children: [] }])).rejects.toThrow(
        errors.YupValidationError
      );
    });

    it('Should keep validating inline nodes with the built-in rules', async () => {
      const validator = createBlocksValidator();

      // Unknown inline node
      await expect(
        validator([{ ...callout, children: [{ type: 'mention', text: 'x' }] }])
      ).rejects.toThrow('Inline node must be Text or Link');
      // Link with a forbidden protocol
      await expect(
        validator([
          {
            ...callout,
            children: [
              {
                type: 'link',
                // eslint-disable-next-line no-script-url
                url: 'javascript:alert(1)',
                children: [{ type: 'text', text: 'x' }],
              },
            ],
          },
        ])
      ).rejects.toThrow('Please specify a valid link.');
    });

    it('Should build the schema of a custom block once, at registration', async () => {
      const validatorFactory = vi.fn(calloutBlock.validator);
      setupStrapi([{ ...calloutBlock, validator: validatorFactory }]);
      expect(validatorFactory).toHaveBeenCalledTimes(1);

      const validator = createBlocksValidator();
      await validator([callout, callout]);
      await validator([callout]);

      expect(validatorFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Nested blocks', () => {
    it('Should accept built-in and custom blocks nested in a custom container block', async () => {
      const validator = createBlocksValidator();
      const nested = [
        {
          type: 'section',
          children: [
            paragraph,
            callout,
            { type: 'section', children: [paragraph, table] },
            {
              type: 'list',
              format: 'unordered',
              children: [{ type: 'list-item', children: [{ type: 'text', text: 'item' }] }],
            },
          ],
        },
      ];

      expect(await validator(nested)).toEqual(nested);
    });

    it('Should reject an unregistered or invalid block nested in a custom container block', async () => {
      const validator = createBlocksValidator();

      await expect(
        validator([{ type: 'section', children: [paragraph, { type: 'banner', children: [] }] }])
      ).rejects.toThrow('Block node is of invalid type');
      await expect(
        validator([
          { type: 'section', children: [{ type: 'section', children: [{ type: 'paragraph' }] }] },
        ])
      ).rejects.toThrow(errors.YupValidationError);
      await expect(
        validator([{ type: 'section', children: [{ ...callout, variant: 'danger' }] }])
      ).rejects.toThrow(errors.YupValidationError);
    });

    it('Should validate the structure of a compound block', async () => {
      const validator = createBlocksValidator();

      expect(await validator([table])).toEqual([table]);
      // A paragraph is not a valid table row
      await expect(validator([{ type: 'table', children: [paragraph] }])).rejects.toThrow(
        errors.YupValidationError
      );
    });
  });

  describe('Draft & publish', () => {
    it.each([
      ['draft', { isDraft: true }],
      ['published', { isDraft: false }],
    ])('Should accept registered blocks when saving a %s entry', async (_, options) => {
      const input = { body: [paragraph, callout, table] };

      await expect(entityValidator.validateEntityCreation(model, input, options)).resolves.toEqual(
        input
      );
      await expect(
        entityValidator.validateEntityUpdate(model, input, options, { id: 1, ...input } as any)
      ).resolves.toEqual(input);
    });

    it.each([
      ['draft', { isDraft: true }],
      ['published', { isDraft: false }],
    ])(
      'Should reject unregistered and invalid blocks when saving a %s entry',
      async (_, options) => {
        await expect(
          entityValidator.validateEntityCreation(
            model,
            { body: [paragraph, { type: 'banner', children: [] }] },
            options
          )
        ).rejects.toMatchObject({
          name: 'ValidationError',
          message: 'Block node is of invalid type',
          details: { errors: [{ path: ['body', '1'] }] },
        });

        await expect(
          entityValidator.validateEntityCreation(
            model,
            { body: [{ ...callout, variant: 'danger' }] },
            options
          )
        ).rejects.toMatchObject({ name: 'ValidationError' });
      }
    );
  });
});
