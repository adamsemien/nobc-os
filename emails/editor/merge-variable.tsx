/** mergeVariable - the custom inline editor node for template variables.
 *
 *  In the editor Chloe sees the SAMPLE value (e.g. "Jordan") styled as a chip;
 *  when the document serializes for saving/sending (composeReactEmail), the
 *  node renders the literal {{key}} token, so the EXISTING send-path
 *  interpolator (lib/email-interpolate.ts via sendTemplatedEmail) resolves it
 *  at send time. One interpolator, never two.
 *
 *  Deliberately NOT the editor package's built-in placeholders plugin: that
 *  plugin emits triple-brace {{{key}}} tokens, which our double-brace regex
 *  would mangle into stray braces.
 */

import * as React from 'react';
import { EmailNode } from '@react-email/editor/core';

import { EMAIL_THEME } from '../theme';
import { SAMPLE_EMAIL_DATA_FLAT } from '@/lib/email-sample-data';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeVariable: {
      /** Insert a {{key}} merge variable at the cursor. */
      insertMergeVariable: (key: string) => ReturnType;
    };
  }
}

export const MergeVariable = EmailNode.create({
  name: 'mergeVariable',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      key: { default: '' },
      sampleValue: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-variable]' }];
  },

  // What Chloe sees while editing: the sample value as a subtly-tinted chip.
  renderHTML({ node }) {
    return [
      'span',
      {
        'data-merge-variable': node.attrs.key,
        title: `{{${node.attrs.key}}}`,
        style: `color:${EMAIL_THEME.red};background:rgba(178,46,33,0.08);border-radius:3px;padding:0 2px;`,
      },
      String(node.attrs.sampleValue || `{{${node.attrs.key}}}`),
    ];
  },

  addCommands() {
    return {
      insertMergeVariable:
        (key: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { key, sampleValue: SAMPLE_EMAIL_DATA_FLAT[key] ?? '' },
          }),
    };
  },

  // What the saved/sent HTML gets: the literal token, resolved at send time.
  renderToReactEmail: ({ node }) => <>{`{{${node.attrs?.key ?? ''}}}`}</>,
});
