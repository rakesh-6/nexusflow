import {
  actionSchema,
  conditionSchema,
  createAutomationSchema,
  dryRunSchema,
  EXECUTION_STATUSES,
  triggerSchema,
  updateAutomationSchema,
} from "@nexusflow/shared";
import { z } from "zod";
import { cursorMeta, ok, okPage, type Endpoint } from "./helpers.ts";

// API documentation for Phase 10: automation rules.

const Automation = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  workspaceId: z.uuid(),
  projectId: z.uuid().nullable(),
  isEnabled: z.boolean(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema),
  summary: z.string(),
  runCount: z.number().int(),
  lastRunAt: z.iso.datetime().nullable(),
  consecutiveFailures: z.number().int(),
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  canManage: z.boolean(),
});

const Execution = z.object({
  id: z.uuid(),
  status: z.enum(EXECUTION_STATUSES),
  trigger: z.object({ event: z.string(), taskKey: z.string().nullable() }),
  result: z.array(z.string()),
  error: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

const O = "/orgs/{orgSlug}";
const MANAGERS =
  "Project rules: the project's managers; workspace-wide rules: workspace admins (FORBIDDEN)";
const NOT_FOUND = "No such rule (or its project) you can open (NOT_FOUND)";

const endpoint = (
  method: Endpoint["method"],
  path: string,
  summary: string,
  responses: Endpoint["responses"],
  extra: Partial<Endpoint> = {},
): Endpoint => ({ method, path, tag: "Automations", summary, auth: true, responses, ...extra });

export const AUTOMATION_ENDPOINTS: Endpoint[] = [
  endpoint("get", `${O}/automations/recipes`, "Ready-made rules to start from", {
    "200": [
      "The recipes",
      ok(
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            rule: z.object({}).loose(),
          }),
        ),
      ),
    ],
  }),
  endpoint(
    "get",
    `${O}/workspaces/{workspaceSlug}/automations`,
    "The workspace's rules: workspace-wide ones and those of projects you can open (?projectId)",
    { "200": ["The rules", ok(z.array(Automation))], "404": ["No such workspace (NOT_FOUND)"] },
  ),
  endpoint(
    "post",
    `${O}/workspaces/{workspaceSlug}/automations`,
    "Creates a rule: when <trigger>, if <conditions>, then <actions>",
    {
      "201": ["The new rule, with its summary sentence", ok(Automation)],
      "400": ["Invalid rule, or a column, label or person that is not here"],
      "402": [
        "FREE plan (PLAN_FEATURE_REQUIRED), or the workspace already has the plan's maximum rules (PLAN_LIMIT_REACHED)",
      ],
      "403": [MANAGERS],
    },
    { body: createAutomationSchema },
  ),
  endpoint(
    "patch",
    `${O}/automations/{automationId}`,
    "Changes a rule (its failure count starts again)",
    {
      "200": ["The rule", ok(Automation)],
      "403": [MANAGERS],
      "404": [NOT_FOUND],
    },
    { body: updateAutomationSchema },
  ),
  endpoint("delete", `${O}/automations/{automationId}`, "Deletes a rule", {
    "200": ["Deleted", ok(z.object({ deleted: z.literal(true) }))],
    "403": [MANAGERS],
    "404": [NOT_FOUND],
  }),
  endpoint(
    "post",
    `${O}/automations/{automationId}/toggle`,
    "Turns a rule on or off",
    {
      "200": ["The rule", ok(Automation)],
      "402": ["Turning on needs a paid plan (PLAN_FEATURE_REQUIRED)"],
      "403": [MANAGERS],
    },
    { optionalBody: true },
  ),
  endpoint(
    "post",
    `${O}/automations/{automationId}/dry-run`,
    "Would the rule fire for this task, and what would it do? Changes nothing",
    {
      "200": [
        "Each condition and each action in plain words",
        ok(
          z.object({
            matches: z.boolean(),
            conditions: z.array(z.object({ text: z.string(), passes: z.boolean() })),
            actions: z.array(z.string()),
          }),
        ),
      ],
      "403": [MANAGERS],
      "404": ["No such task for this rule (NOT_FOUND)"],
    },
    { body: dryRunSchema },
  ),
  endpoint(
    "get",
    `${O}/automations/{automationId}/executions`,
    "The rule's run log, newest first (?status&cursor&limit)",
    { "200": ["One page of runs", okPage(z.array(Execution), cursorMeta)], "403": [MANAGERS] },
  ),
];
