import { z } from "zod";
import { PRIORITIES } from "./projects.ts";

// AI features (PRD §11.16, §24). Everything the AI answers is a suggestion:
// the web app shows it as a preview the person accepts, edits or discards.
// Shared by the API (which checks the provider's answer against these
// schemas) and the web app (which shows the previews).

export const AI_FEATURES = [
  "TASK_DESCRIPTION",
  "TASK_BREAKDOWN",
  "PROJECT_PLAN",
  "PROJECT_SUMMARY",
  "MEETING_NOTES",
  "INSIGHTS",
  "DEADLINE_SUGGESTION",
  "WEEKLY_REPORT",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Requests per person per hour (PRD §11.16.1). */
export const AI_REQUESTS_PER_HOUR = 20;
/** Pasted meeting notes, at most 20 kB of text. */
export const MAX_MEETING_NOTES_CHARS = 20_000;

const title = z.string().trim().min(1).max(200);
const line = z.string().trim().min(1).max(500);
const isoDate = z.iso.date();

// ---------------------------------------------------------------------------
// What the browser sends
// ---------------------------------------------------------------------------

export const taskDescriptionRequestSchema = z.object({
  projectId: z.uuid(),
  title,
  taskId: z.uuid().optional(),
});
export const taskIdRequestSchema = z.object({ taskId: z.uuid() });
export const projectSummaryRequestSchema = z.object({ projectId: z.uuid() });
export const projectPlanRequestSchema = z.object({ projectId: z.uuid() });
export const meetingNotesRequestSchema = z.object({
  text: z.string().trim().min(20, "Paste at least a few sentences").max(MAX_MEETING_NOTES_CHARS),
  projectId: z.uuid().optional(),
});
export const insightsRequestSchema = z.object({ workspaceId: z.uuid() });
export const aiSettingsSchema = z.object({ aiEnabled: z.boolean() });

// ---------------------------------------------------------------------------
// What the AI must answer (checked; anything else is 502 AI_INVALID_OUTPUT)
// ---------------------------------------------------------------------------

export const taskDescriptionOutputSchema = z.object({
  goal: z.string().trim().min(1).max(1_000),
  details: z.array(line).max(8).default([]),
  acceptanceCriteria: z.array(line).min(1).max(10),
});
export type TaskDescriptionOutput = z.infer<typeof taskDescriptionOutputSchema>;

export const taskBreakdownOutputSchema = z.object({
  subtasks: z
    .array(
      z.object({
        title,
        estimatedHours: z.number().min(0.25).max(200).nullish(),
        priority: z.enum(PRIORITIES).nullish(),
      }),
    )
    .min(3)
    .max(10),
});
export type TaskBreakdownOutput = z.infer<typeof taskBreakdownOutputSchema>;

export const projectPlanOutputSchema = z.object({
  milestones: z.array(z.object({ name: title, dueDate: isoDate.nullish() })).max(8),
  tasks: z
    .array(
      z.object({
        title,
        milestoneIndex: z.number().int().min(0).max(7).nullish(),
        priority: z.enum(PRIORITIES).nullish(),
        estimatedHours: z.number().min(0.25).max(200).nullish(),
      }),
    )
    .min(1)
    .max(30),
});
export type ProjectPlanOutput = z.infer<typeof projectPlanOutputSchema>;

export const projectSummaryOutputSchema = z.object({
  summary: z.string().trim().min(1).max(3_000),
  highlights: z.array(line).max(8).default([]),
  risks: z.array(line).max(8).default([]),
});
export type ProjectSummaryOutput = z.infer<typeof projectSummaryOutputSchema>;

export const meetingNotesOutputSchema = z.object({
  summary: z.string().trim().min(1).max(3_000),
  decisions: z.array(line).max(15).default([]),
  actionItems: z
    .array(
      z.object({
        title,
        assigneeHint: z.string().max(100).nullish(),
        dueHint: z.string().max(100).nullish(),
      }),
    )
    .max(20)
    .default([]),
});
export type MeetingNotesOutput = z.infer<typeof meetingNotesOutputSchema>;

export const insightsOutputSchema = z.object({
  insights: z
    .array(z.object({ title, detail: line }))
    .min(1)
    .max(5),
});
export type InsightsOutput = z.infer<typeof insightsOutputSchema>;

export const deadlineOutputSchema = z.object({
  suggestedDueDate: isoDate,
  rationale: z.string().trim().min(1).max(600),
});
export type DeadlineOutput = z.infer<typeof deadlineOutputSchema>;

// ---------------------------------------------------------------------------
// Status for the web app
// ---------------------------------------------------------------------------

export interface AiStatus {
  /** The organization's switch (owners turn it off in Settings › AI). */
  enabled: boolean;
  /** The plan includes AI (FREE does not). */
  planAllows: boolean;
  /** Requests this calendar month, and the plan's monthly allowance (null: unlimited). */
  usedThisMonth: number;
  monthlyLimit: number | null;
  provider: string;
  canManage: boolean;
}

export interface AiUsageRow {
  feature: AiFeature;
  requests: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
}

/** Every AI answer comes with this label in the UI (PRD §24.1 "transparent"). */
export const AI_LABEL = "AI-generated suggestion. Check it before you use it.";
