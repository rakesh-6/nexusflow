import {
  REACTION_EMOJIS,
  type CommentSummary,
  type MentionablePerson,
  type TaskDetail,
} from "@nexusflow/shared";
import { SmilePlus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Skeleton } from "../../../components/ui/skeleton";
import { errorMessage } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useCurrentUser } from "../../auth/hooks";
import { formatDateTime } from "../../organizations/labels";
import { sendTyping, type Typist } from "../../realtime/useRealtime";
import { useChangeComments, useComments, useMentionable } from "../hooks";
import { CommentBody } from "./CommentBody";

// Comments on a task (PRD §11.9): threads one level deep, @mentions, emoji
// reactions, edit by the author, delete by the author or a project manager.

const CommentEditor = lazy(() => import("./CommentEditor"));

type Change = ReturnType<typeof useChangeComments>;

function Reactions({
  comment,
  userId,
  change,
}: {
  comment: CommentSummary;
  userId: string | undefined;
  change: Change;
}) {
  const [open, setOpen] = useState(false);
  const react = (emoji: string) => {
    change.mutate({ kind: "react", commentId: comment.id, emoji });
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {comment.reactions.map((reaction) => {
        const mine = !!userId && reaction.userIds.includes(userId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={mine}
            aria-label={`${reaction.emoji} ${reaction.count}${mine ? ", yours (click to remove)" : ""}`}
            onClick={() => react(reaction.emoji)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
              mine ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-surface",
            )}
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            <span className="tabular-nums">{reaction.count}</span>
          </button>
        );
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Add a reaction"
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <SmilePlus className="size-3.5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1.5">
          <div className="grid grid-cols-8 gap-0.5" role="group" aria-label="Reactions">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React with ${emoji}`}
                onClick={() => react(emoji)}
                className="flex size-8 items-center justify-center rounded-[5px] text-base hover:bg-surface"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CommentItem({
  comment,
  people,
  canComment,
  userId,
  change,
  isReply,
}: {
  comment: CommentSummary;
  people: MentionablePerson[];
  canComment: boolean;
  userId: string | undefined;
  change: Change;
  isReply: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyKey, setReplyKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className={cn("flex gap-3", isReply && "mt-3")}>
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className={isReply ? "size-6" : "size-8"}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{comment.author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(comment.createdAt)}
            {comment.editedAt && " · edited"}
          </span>
        </p>
        {comment.deleted ? (
          <p className="text-sm italic text-muted-foreground">Comment deleted</p>
        ) : editing && comment.body ? (
          <Suspense fallback={<Skeleton className="h-20" />}>
            <CommentEditor
              initial={comment.body}
              people={people}
              placeholder="Edit your comment"
              submitLabel="Save"
              busy={change.isPending}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={(body) =>
                change.mutate(
                  { kind: "update", commentId: comment.id, body },
                  { onSuccess: () => setEditing(false) },
                )
              }
            />
          </Suspense>
        ) : (
          comment.body && <CommentBody doc={comment.body} />
        )}

        {!comment.deleted && !editing && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Reactions comment={comment} userId={userId} change={change} />
            {canComment && !isReply && (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setReplying(true)}
              >
                Reply
              </button>
            )}
            {comment.canEdit && (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            {comment.canDelete && !confirmDelete && (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            {confirmDelete && (
              <span className="flex items-center gap-2 text-xs">
                Delete this comment?
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-xs"
                  onClick={() => change.mutate({ kind: "delete", commentId: comment.id })}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </span>
            )}
          </div>
        )}

        {comment.replies.length > 0 && (
          <ol aria-label="Replies">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                people={people}
                canComment={canComment}
                userId={userId}
                change={change}
                isReply
              />
            ))}
          </ol>
        )}
        {replying && (
          <div className="pt-2">
            <Suspense fallback={<Skeleton className="h-20" />}>
              <CommentEditor
                key={replyKey}
                people={people}
                placeholder={`Reply to ${comment.author.name}`}
                submitLabel="Reply"
                busy={change.isPending}
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={(body) =>
                  change.mutate(
                    { kind: "create", body, parentCommentId: comment.id },
                    {
                      onSuccess: () => {
                        setReplyKey((key) => key + 1);
                        setReplying(false);
                      },
                    },
                  )
                }
              />
            </Suspense>
          </div>
        )}
      </div>
    </li>
  );
}

export function CommentsSection({
  orgSlug,
  task,
  typing = [],
}: {
  orgSlug: string;
  task: TaskDetail;
  /** Other people typing a comment on this task right now. */
  typing?: Typist[];
}) {
  const comments = useComments(orgSlug, task.id);
  const { data: people = [] } = useMentionable(orgSlug, task.id);
  const change = useChangeComments(orgSlug, task.projectId, task.id);
  const { data: user } = useCurrentUser();
  const [composerKey, setComposerKey] = useState(0);
  const canComment = task.canEdit;

  return (
    <div className="space-y-4">
      {comments.isPending ? (
        <Skeleton className="h-16" />
      ) : comments.isError ? (
        <p className="text-sm text-muted-foreground">Comments could not be loaded.</p>
      ) : comments.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="space-y-4" aria-label="Comments">
          {comments.data.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              people={people}
              canComment={canComment}
              userId={user?.id}
              change={change}
              isReply={false}
            />
          ))}
        </ol>
      )}
      {change.isError && <p className="text-xs text-destructive">{errorMessage(change.error)}</p>}
      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {typing.length === 1 && `${typing[0]?.name} is typing…`}
        {typing.length > 1 && `${typing.map((typist) => typist.name).join(", ")} are typing…`}
      </p>
      {canComment && (
        <Suspense fallback={<Skeleton className="h-24" />}>
          <CommentEditor
            key={composerKey}
            people={people}
            placeholder="Write a comment…"
            submitLabel="Comment"
            busy={change.isPending}
            onTyping={() => sendTyping(task.id, true)}
            onSubmit={(body) => {
              sendTyping(task.id, false);
              change.mutate(
                { kind: "create", body },
                { onSuccess: () => setComposerKey((k) => k + 1) },
              );
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
