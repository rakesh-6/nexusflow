import { z } from "zod";
import type { PersonSummary } from "./projects.ts";
import { richTextDocSchema, type RichTextDoc } from "./richText.ts";

// Comments and reactions on tasks (PRD §11.9), shared by the API and the web app.

/** A comment may be 20 kB of editor JSON. */
export const COMMENT_MAX_CHARS = 20_000;

/** The 24 emoji the picker offers (PRD §11.9). Any single emoji is accepted too. */
export const REACTION_EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "🎉",
  "😄",
  "😮",
  "😢",
  "🙏",
  "👀",
  "🔥",
  "✅",
  "❌",
  "🚀",
  "💡",
  "🤔",
  "👏",
  "💯",
  "⭐",
  "🐛",
  "⚠️",
  "🙌",
  "😅",
  "💪",
  "🎯",
] as const;

/** One emoji: a single visible character (a grapheme), made of pictographs. */
export function isSingleEmoji(value: string): boolean {
  if (value.length === 0 || value.length > 32) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

const commentBody = richTextDocSchema.refine(
  (doc) => JSON.stringify(doc).length <= COMMENT_MAX_CHARS,
  { message: "Comments can be at most 20,000 characters long" },
);

export const createCommentSchema = z.object({
  body: commentBody,
  /** Make this a reply to another comment (replies cannot have replies). */
  parentCommentId: z.uuid().optional(),
});

export const updateCommentSchema = z.object({ body: commentBody });

export const reactionSchema = z.object({
  emoji: z.string().refine(isSingleEmoji, { message: "Use a single emoji" }),
});

export type CreateCommentInput = z.input<typeof createCommentSchema>;

// ---------------------------------------------------------------------------
// What the API answers
// ---------------------------------------------------------------------------

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Everyone who reacted with it, so the screen can mark your own. */
  userIds: string[];
}

export interface CommentSummary {
  id: string;
  taskId: string;
  parentCommentId: string | null;
  author: PersonSummary;
  /** Null for a deleted comment that stays only to keep its replies in place. */
  body: RichTextDoc | null;
  bodyText: string;
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
  reactions: ReactionSummary[];
  replies: CommentSummary[];
  /** Only the author edits a comment. */
  canEdit: boolean;
  /** The author and project managers delete it. */
  canDelete: boolean;
}

/** Someone who can be @mentioned: anyone who can open the project. */
export type MentionablePerson = PersonSummary;
