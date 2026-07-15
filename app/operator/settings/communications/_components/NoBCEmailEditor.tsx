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
 *
 *  Inline images (Phase 1): the package's email-safe image node (activated by
 *  the onUploadImage prop; serializes to a react-email <Img> with width as an
 *  HTML attribute, which Outlook needs). Uploads reuse the DAM chain and land
 *  in the "Email Images" folder; emailed src URLs are the DAM's stable public
 *  /i/{token} links (HMAC, no expiry) - never signed R2 URLs, which expire.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { EmailEditor, type EmailEditorRef } from '@react-email/editor';
import { composeReactEmail } from '@react-email/editor/core';
import { StarterKit } from '@react-email/editor/extensions';
import { EmailTheming, type ThemeConfig } from '@react-email/editor/plugins';
import { Placeholder } from '@tiptap/extension-placeholder';
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
      // Must be a unit-carrying string: the theming pipeline appends the
      // panel's % unit to bare numbers, so 1.75 becomes line-height:1.75%
      // (~0.3px) and every line collapses onto the previous one — in the
      // edit surface, the preview iframe, AND any bodyHtml saved from here.
      lineHeight: '175%',
    },
    h1: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    h2: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    h3: { color: EMAIL_THEME.ink, fontFamily: EMAIL_THEME.fontDisplay },
    link: { color: EMAIL_THEME.red },
    button: { backgroundColor: EMAIL_THEME.red, color: '#FFFFFF' },
  },
};

// The `extensions` prop on EmailEditor REPLACES the package's defaults
// (extensionsProp ?? [StarterKit, Placeholder, EmailTheming]) — it does not
// extend them. Passing [MergeVariable] alone drops StarterKit's Document node
// and crashes ProseMirror at construction ("Schema is missing its top node
// type ('doc')"), and silently kills the theme/placeholder props, which are
// only consumed inside the default branch. So the full default set is rebuilt
// here explicitly, with MergeVariable appended.
export const EDITOR_EXTENSIONS = [
  StarterKit.configure(),
  Placeholder.configure({ placeholder: 'Write the reminder…', includeChildren: true }),
  EmailTheming.configure({ theme: NOBC_EDITOR_THEME }),
  MergeVariable,
];

// Bubble-menu chrome wears NoBC tokens via the package's --re-* variables
// (EMAIL_THEME's sanctioned literals only; hover/active washes keep the
// package's neutral defaults). The bubble menu mounts inside the editor's
// parent element, so these wrapper-scoped vars reach it; the slash-command
// menu portals to document.body and keeps the package default theme.
const BUBBLE_MENU_VARS = {
  '--re-bg': EMAIL_THEME.paper,
  '--re-text': EMAIL_THEME.ink,
  '--re-text-muted': EMAIL_THEME.muted,
  '--re-border': EMAIL_THEME.rule,
  '--re-separator': EMAIL_THEME.rule,
} as CSSProperties;

// ---------------------------------------------------------------------------
// Inline image upload chain - REUSES the DAM (no new routes, no new storage):
// POST /api/media/dam/upload (Sharp, BlurHash, tagging, library row) → GET
// /api/media/dam/asset/[id]/public-link (stable HMAC /i/{token} URL, no
// expiry - the only URL form safe to put in an email). A mint 503 means
// DAM_PUBLIC_LINK_SECRET is unset: fail loud, never fall back to a signed R2
// URL, which would expire in the recipient's inbox.
// ---------------------------------------------------------------------------

const EMAIL_IMAGES_FOLDER_NAME = 'Email Images';

// Email images land in one dedicated DAM folder, resolved-or-created on first
// upload. Promise-cached at module scope so concurrent uploads (paste while a
// picker upload is in flight) cannot double-create the folder.
let emailImagesFolderPromise: Promise<string> | null = null;

async function lookupOrCreateEmailImagesFolder(): Promise<string> {
  const list = await fetch('/api/media/dam/folders');
  if (list.ok) {
    const data = (await list.json()) as { folders?: { id: string; name: string }[] };
    const existing = data.folders?.find((f) => f.name === EMAIL_IMAGES_FOLDER_NAME);
    if (existing) return existing.id;
  }
  const created = await fetch('/api/media/dam/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: EMAIL_IMAGES_FOLDER_NAME, type: 'BRAND' }),
  });
  if (!created.ok) {
    throw new Error(`Could not resolve the Email Images folder (${created.status})`);
  }
  const { folder } = (await created.json()) as { folder: { id: string } };
  return folder.id;
}

function resolveEmailImagesFolderId(): Promise<string> {
  if (!emailImagesFolderPromise) {
    emailImagesFolderPromise = lookupOrCreateEmailImagesFolder().catch((err) => {
      emailImagesFolderPromise = null; // failed resolves must not poison retries
      throw err;
    });
  }
  return emailImagesFolderPromise;
}

type UploadedEmailImage = { publicUrl: string; naturalWidth: number | null; alt: string };

async function uploadEmailImage(file: File): Promise<UploadedEmailImage> {
  const folderId = await resolveEmailImagesFolderId();
  const form = new FormData();
  form.append('file', file);
  form.append('folderId', folderId);
  const up = await fetch('/api/media/dam/upload', { method: 'POST', body: form });
  if (!up.ok) throw new Error(`Image upload failed (${up.status})`);
  const asset = (await up.json()) as { id: string; width: number | null };
  const mint = await fetch(`/api/media/dam/asset/${asset.id}/public-link`);
  if (!mint.ok) throw new Error(`Public image link failed (${mint.status})`);
  const { url } = (await mint.json()) as { url: string };
  return {
    publicUrl: url,
    naturalWidth: asset.width,
    alt: file.name.replace(/\.[a-z0-9]+$/i, ''),
  };
}

// Paste/drag-drop path. The package's upload flow owns the insert transaction
// (optimistic blob preview → swap src on completion) and its uploadImage
// signature returns only { url }, so a width attribute cannot be set at insert
// time on this path. Fallback per plan: serve the bitmap at 600px flat - the
// node keeps the package default width ("auto") and the image can never
// exceed the 600px email body. Module-scope on purpose: EmailEditor memoizes
// the image extension on this function's identity, so an inline closure would
// rebuild the extension (and remount the editor) on every render.
async function uploadImageForPasteFlow(file: File): Promise<{ url: string }> {
  const { publicUrl } = await uploadEmailImage(file);
  return { url: `${publicUrl}?w=600` };
}

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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

  // Picker path: upload first, then insert once - width is set in the SAME
  // transaction that creates the image node (setImage = one insertContent),
  // using the natural width Sharp measured at upload. min(600, natural) fills
  // the email body without ever upscaling a smaller image; src at ?w=1200
  // keeps the bitmap crisp on retina screens.
  async function insertImageFromFile(file: File) {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const { publicUrl, naturalWidth, alt } = await uploadEmailImage(file);
      const width = Math.min(600, naturalWidth ?? 600);
      editor
        .chain()
        .focus()
        .setImage({ src: `${publicUrl}?w=1200`, width: String(width), alt })
        .run();
    } catch (err) {
      console.error('[NoBCEmailEditor] image insert failed:', err);
      setImageError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
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

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imageUploading}
          className="flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-text-secondary hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {imageUploading ? 'Uploading…' : 'Insert image'}
        </button>
        <span className="text-[11px] text-text-muted">
          Select text to format - type / for headings, lists and more
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void insertImageFromFile(file);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
      </div>
      {imageError ? (
        <p className="mb-2 text-[11px] text-danger">{imageError}</p>
      ) : null}

      <div
        className="overflow-hidden rounded-md border border-border bg-white"
        style={BUBBLE_MENU_VARS}
      >
        <EmailEditor
          ref={editorRef}
          content={initialContent as Content}
          extensions={EDITOR_EXTENSIONS}
          onUploadImage={uploadImageForPasteFlow}
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
