import type { yup } from '@strapi/utils';

/**
 * Validators for the built-in nodes, passed to custom block validators so they can
 * describe their children with the same rules as the core blocks.
 */
export interface CustomBlockValidatorHelpers {
  /**
   * Validates a `text` leaf node
   */
  textNodeValidator: yup.AnySchema;

  /**
   * Validates a `link` inline node
   */
  linkNodeValidator: yup.AnySchema;

  /**
   * Validates an inline node (`text` or `link`)
   */
  inlineNodeValidator: yup.AnySchema;

  /**
   * Validates any block node (built-in or registered custom block).
   * Use it for custom blocks that contain other blocks.
   */
  blockNodeValidator: yup.AnySchema;

  /**
   * Returns true if the link uses an allowed protocol
   */
  checkValidLink: (link: string) => boolean;
}

export interface CustomBlockServerOptions {
  /**
   * The block node type, as stored in the `type` key of the node (e.g. `callout`)
   */
  name: string;

  /**
   * The name of the plugin creating the custom block
   */
  plugin?: string;

  /**
   * Returns the Yup schema used to validate a node of this type.
   * It is called once, the first time a node of this type is validated.
   */
  validator: (helpers: CustomBlockValidatorHelpers) => yup.AnySchema;
}

export interface CustomBlocks {
  register: (customBlocks: CustomBlockServerOptions[] | CustomBlockServerOptions) => void;
}
