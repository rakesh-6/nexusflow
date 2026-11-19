import { z } from "zod";

// Rich text as the editor's JSON document (Tiptap, PRD §11.6, SEC-05). The
// server accepts only the node and mark types below, with simple attribute
// values, so stored text can never carry scripts or unsafe links. It is shown
// by the editor from this JSON, never as raw HTML.

export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

export interface RichTextDoc {
  type: "doc";
  content?: RichTextNode[];
}

export const RICH_TEXT_MAX_CHARS = 50_000;
const MAX_DEPTH = 20;

const NODE_TYPES = [
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "mention",
] as const;
const MARK_TYPES = ["bold", "italic", "strike", "underline", "code", "link"] as const;

const attrs = z
  .record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .optional();

const safeHref = (href: unknown) =>
  typeof href === "string" && /^(https?:\/\/|mailto:)/i.test(href.trim());

const markSchema = z
  .object({ type: z.enum(MARK_TYPES), attrs })
  .refine((mark) => mark.type !== "link" || safeHref(mark.attrs?.["href"]), {
    message: "Links must start with http://, https:// or mailto:",
  });

const nodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.enum(NODE_TYPES),
    attrs,
    content: z.array(nodeSchema).max(2000).optional(),
    marks: z.array(markSchema).max(10).optional(),
    text: z.string().max(RICH_TEXT_MAX_CHARS).optional(),
  }),
);

/** Size and nesting are checked first, without recursion, so odd input cannot overload the parser. */
function withinLimits(value: unknown) {
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number };
    if (depth > MAX_DEPTH) return false;
    const content = (node as { content?: unknown } | null)?.content;
    if (Array.isArray(content)) {
      for (const child of content) stack.push({ node: child, depth: depth + 1 });
    }
  }
  try {
    return JSON.stringify(value).length <= RICH_TEXT_MAX_CHARS;
  } catch {
    return false;
  }
}

export const richTextDocSchema = z
  .custom<unknown>(withinLimits, "The text is too long or nested too deeply")
  .pipe(
    z.object({
      type: z.literal("doc"),
      content: z.array(nodeSchema).max(2000).optional(),
    }),
  );

const LINE_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** The words of a document as plain text, for search and previews. */
export function docToText(doc: RichTextDoc | null | undefined): string {
  if (!doc) return "";
  const walk = (node: RichTextNode): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "mention") return `@${String(node.attrs?.["label"] ?? "")}`;
    const inner = (node.content ?? []).map(walk).join("");
    return LINE_BLOCKS.has(node.type) ? `${inner}\n` : inner;
  };
  return walk(doc as RichTextNode)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Keeps @mentions of people in `allowedIds` and turns every other mention into
 * plain "@name" text, so nobody is mentioned (or notified) who cannot see the
 * task (PRD §11.9, AC-COMM-01). Returns the cleaned document and who is mentioned.
 */
export function sanitizeMentions(
  doc: RichTextDoc,
  allowedIds: ReadonlySet<string>,
): { doc: RichTextDoc; mentionedIds: string[] } {
  const mentioned = new Set<string>();
  const clean = (node: RichTextNode): RichTextNode => {
    if (node.type === "mention") {
      const id = String(node.attrs?.["id"] ?? "");
      if (allowedIds.has(id)) {
        mentioned.add(id);
        return node;
      }
      return { type: "text", text: `@${String(node.attrs?.["label"] ?? "someone")}` };
    }
    return node.content ? { ...node, content: node.content.map(clean) } : node;
  };
  const cleaned = { ...doc, ...(doc.content ? { content: doc.content.map(clean) } : {}) };
  return { doc: cleaned, mentionedIds: [...mentioned] };
}

/** Plain text as a document, one paragraph per blank-line-separated block. */
export function textToDoc(text: string): RichTextDoc {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim() !== "")
      .map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] })),
  };
}
