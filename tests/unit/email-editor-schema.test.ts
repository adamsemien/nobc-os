/** Regression gate for the event.reminder editor prod crash (2026-07-14):
 *  "RangeError: Schema is missing its top node type ('doc')".
 *
 *  EmailEditor's `extensions` prop REPLACES the package defaults
 *  (extensionsProp ?? [StarterKit, Placeholder, EmailTheming]) rather than
 *  extending them. Passing [MergeVariable] alone therefore built a schema
 *  with no Document top node and threw at editor construction. These tests
 *  pin both halves: the broken shape still throws (proving the diagnosis
 *  stays valid) and the shipped EDITOR_EXTENSIONS array builds a complete,
 *  NoBC-themed schema.
 */
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';

import { MergeVariable } from '@/emails/editor/merge-variable';
import { EDITOR_EXTENSIONS } from '@/app/operator/settings/communications/_components/NoBCEmailEditor';
import { EMAIL_THEME } from '@/emails/theme';

describe('event.reminder editor schema', () => {
  it('repro: MergeVariable alone is missing the doc top node (the prod crash)', () => {
    expect(() => getSchema([MergeVariable])).toThrowError(
      /Schema is missing its top node type \('doc'\)/,
    );
  });

  it('EDITOR_EXTENSIONS builds a schema with doc, paragraph, text and mergeVariable', () => {
    const schema = getSchema(EDITOR_EXTENSIONS);
    expect(schema.topNodeType.name).toBe('doc');
    expect(schema.nodes.paragraph).toBeDefined();
    expect(schema.nodes.text).toBeDefined();
    expect(schema.nodes.mergeVariable).toBeDefined();
  });

  it('EmailTheming is configured with the real NoBC theme, not left unthemed', () => {
    const theming = EDITOR_EXTENSIONS.find((ext) => ext.name === 'theming');
    expect(theming).toBeDefined();
    const theme = (theming as unknown as { options: { theme: { styles: Record<string, Record<string, unknown>> } } })
      .options.theme;
    expect(theme.styles.body.backgroundColor).toBe(EMAIL_THEME.paper); // cream #F9F7F2
    expect(theme.styles.body.fontFamily).toContain('Georgia');
    expect(theme.styles.button.backgroundColor).toBe(EMAIL_THEME.red); // NBC Red #B22E21
    expect(theme.styles.link.color).toBe(EMAIL_THEME.red);
  });
});
