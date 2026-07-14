'use client';

/** NoBC-themed wrapper around @react-email/editor for the communications page.
 *
 *  event.reminder only for now - the other templates stay on the plain string
 *  editor until this slice is proven. Loaded via next/dynamic (ssr: false)
 *  from CommunicationsEditor: TipTap is browser-only.
 *
 *  On every edit (debounced) it serializes the document through
 *  composeReactEmail and hands the parent { editorConfig, html, text }:
 *  editorConfig is the TipTap JSON (source of truth for re-editing), html is
 *  the UNFORMATTED render (the package documents it as the persist/send
 *  variant), text is the plain-text body. Merge variables serialize to
 *  literal {{key}} tokens for the existing send-path interpolator.
 */

import { useEffect, useRef } from 'react';
import { EmailEditor, type EmailEditorRef } from '@react-email/editor';
import { composeReactEmail } from '@react-email/editor/core';
import type { ThemeConfig } from '@react-email/editor/plugins';
import type { Content, JSONContent } from '@tiptap/core';

import '@react-email/editor/themes/default.css';
import '@react-email/editor/styles/bubble-menu.css';
import '@react-email/editor/styles/slash-command.css';

import { EMAIL_THEME } from '@/emails/theme';
import { MergeVariable } from '@/emails/editor/merge-variable';
import { SAMPLE_EMAIL_DATA_FLAT } from '@/lib/email-sample-data';

export type ComposedEmail = {
  editorConfig: JSONContent;
  html: string;
  text: string;
};

// Mirrors the live templates (emails/theme.ts): cream paper, Georgia, NBC Red.
const NOBC_EDITOR_THEME: ThemeConfig = {
  extends: 'basic',
  styles: {
    body: {
      backgroundColor: EMAIL_THEME.paper,
      color: EMAIL_THEME.text,
      fontFamily: EMAIL_THEME.fontBody,
    },
    container: { backgroundColor: EMAIL_THEME.paper },
    paragraph: {
      color: EMAIL_THEME.text,
      fontFamily: EMAIL_THEME.fontBody,
      fontSize: 15,
      lineHeight: 1.75,
    },
    h1: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    h2: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    h3: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    link: { color: EMAIL_THEME.red },
    button: { backgroundColor: EMAIL_THEME.red, color: '#FFFFFF' },
  },
};

export default function NoBCEmailEditor({
  initialContent,
  variables,
  onDocumentChange,
}: {
  /** Saved editorConfig JSON, or the existing bodyHtml string on first edit.
   *  Typed loosely so the parent doesn't need TipTap's types. */
  initialContent: object | string;
  /** Variable keys offered as insert chips ({{member.firstName}} etc.). */
  variables: string[];
  onDocumentChange: (composed: ComposedEmail) => void;
}) {
  const editorRef = useRef<EmailEditorRef | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serial guard: composeReactEmail is async - drop stale results so a slow
  // early render can't overwrite a newer one.
  const composeSeq = useRef(0);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function scheduleCompose(ref: EmailEditorRef) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const editor = ref.editor;
      if (!editor) return;
      const seq = ++composeSeq.current;
      try {
        const { unformattedHtml, text } = await composeReactEmail({ editor });
        if (seq !== composeSeq.current) return;
        onDocumentChange({ editorConfig: ref.getJSON(), html: unformattedHtml, text });
      } catch (err) {
        console.error('[NoBCEmailEditor] composeReactEmail failed:', err);
      }
    }, 400);
  }

  function insertVariable(key: string) {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertMergeVariable(key)
      .run();
  }

  return (
    <div>
      {variables.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary">
            Variables — click to insert
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                title={`Inserts {{${v}}} (shows "${String(SAMPLE_EMAIL_DATA_FLAT[v] ?? '')}" while editing)`}
                className="rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-text-secondary hover:border-primary hover:text-primary"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-white">
        <EmailEditor
          ref={editorRef}
          content={initialContent as Content}
          theme={NOBC_EDITOR_THEME}
          extensions={[MergeVariable]}
          placeholder="Write the reminder…"
          onReady={(ref) => {
            editorRef.current = ref;
            scheduleCompose(ref);
          }}
          onUpdate={(ref) => {
            editorRef.current = ref;
            scheduleCompose(ref);
          }}
        />
      </div>
    </div>
  );
}
