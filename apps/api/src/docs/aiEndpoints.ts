import {
  AI_FEATURES,
  aiSettingsSchema,
  deadlineOutputSchema,
  insightsOutputSchema,
  insightsRequestSchema,
  meetingNotesOutputSchema,
  meetingNotesRequestSchema,
  projectPlanOutputSchema,
  projectPlanRequestSchema,
  projectSummaryOutputSchema,
  projectSummaryRequestSchema,
  richTextDocSchema,
  taskBreakdownOutputSchema,
  taskDescriptionOutputSchema,
  taskDescriptionRequestSchema,
  taskIdRequestSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { FORBIDDEN, ok, type Endpoint } from "./helpers.ts";

// API documentation for Phase 11: AI features. These routes exist only when
// the server has an AI provider (AI_API_KEY); otherwise they answer 404.

const O = "/orgs/{orgSlug}/ai";
const Status = z.object({
  enabled: z.boolean(),
  planAllows: z.boolean(),
  usedThisMonth: z.number().int(),
  monthlyLimit: z.number().int().nullable(),
  provider: z.string(),
  canManage: z.boolean(),
});

/** What every AI endpoint can answer besides success. */
const AI_ERRORS: Endpoint["responses"] = {
  "402": [
    "FREE plan (PLAN_FEATURE_REQUIRED) or the month's requests used up (PLAN_LIMIT_REACHED, limit aiRequestsPerMonth)",
  ],
  "403": [`${FORBIDDEN}, or AI turned off for the organization (AI_DISABLED)`],
  "429": ["More than 20 AI requests in an hour (RATE_LIMITED)"],
  "502": [
    "The AI did not answer (AI_PROVIDER_ERROR) or answered something unusable (AI_INVALID_OUTPUT)",
  ],
  "503": ["The free AI service is busy (AI_BUSY) or failing (AI_UNAVAILABLE)"],
};

const feature = (path: string, summary: string, body: z.ZodType, output: z.ZodType): Endpoint => ({
  method: "post",
  path: `${O}/${path}`,
  tag: "AI",
  summary: `${summary} (a suggestion; nothing is saved)`,
  auth: true,
  body,
  responses: { "200": ["The suggestion", ok(output)], ...AI_ERRORS },
});

export const AI_ENDPOINTS: Endpoint[] = [
  {
    method: "get",
    path: `${O}/status`,
    tag: "AI",
    summary: "Whether AI is on, allowed by the plan, and this month's use",
    auth: true,
    responses: { "200": ["The status", ok(Status)], "404": ["AI is not set up on this server"] },
  },
  {
    method: "get",
    path: `${O}/usage`,
    tag: "AI",
    summary: "This month's AI requests per feature (owners and admins)",
    auth: true,
    responses: {
      "200": [
        "Usage rows",
        ok(
          z.array(
            z.object({
              feature: z.enum(AI_FEATURES),
              requests: z.number().int(),
              failed: z.number().int(),
              promptTokens: z.number().int(),
              completionTokens: z.number().int(),
            }),
          ),
        ),
      ],
      "403": [FORBIDDEN],
    },
  },
  {
    method: "put",
    path: `${O}/settings`,
    tag: "AI",
    summary: "Turns AI on or off for the organization (owner only)",
    auth: true,
    body: aiSettingsSchema,
    responses: { "200": ["The new status", ok(Status)], "403": ["Only the owner (FORBIDDEN)"] },
  },
  feature(
    "task-description",
    "Drafts a task description",
    taskDescriptionRequestSchema,
    taskDescriptionOutputSchema.extend({ description: richTextDocSchema }),
  ),
  feature(
    "task-breakdown",
    "Suggests 3-10 subtasks",
    taskIdRequestSchema,
    taskBreakdownOutputSchema,
  ),
  feature("deadline-suggestion", "Suggests a due date", taskIdRequestSchema, deadlineOutputSchema),
  feature(
    "project-plan",
    "Suggests milestones and first tasks (project managers)",
    projectPlanRequestSchema,
    projectPlanOutputSchema,
  ),
  feature(
    "project-summary",
    "Summarizes where a project stands",
    projectSummaryRequestSchema,
    projectSummaryOutputSchema,
  ),
  feature(
    "meeting-notes",
    "Summarizes pasted meeting notes (up to 20 kB)",
    meetingNotesRequestSchema,
    meetingNotesOutputSchema,
  ),
  feature(
    "insights",
    "Explains a workspace's analytics numbers",
    insightsRequestSchema,
    insightsOutputSchema,
  ),
];
