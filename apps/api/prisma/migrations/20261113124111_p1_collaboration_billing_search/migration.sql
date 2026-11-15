-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('IMAGE', 'VIDEO', 'RAW');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('DOMAIN', 'SECURITY', 'BILLING');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'AUTHENTICATED', 'INCOMPLETE', 'PAST_DUE', 'UNPAID', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'PARTIALLY_PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('TASK_DESCRIPTION', 'TASK_BREAKDOWN', 'PROJECT_PLAN', 'PROJECT_SUMMARY', 'MEETING_NOTES', 'INSIGHTS', 'DEADLINE_SUGGESTION', 'WEEKLY_REPORT');

-- Search columns (hand-edited, PRD §11.13). PostgreSQL computes these itself
-- ("GENERATED ALWAYS ... STORED") whenever the source text changes. Weight A
-- (names, titles) ranks above B (comments) and C (descriptions). The 'simple'
-- dictionary does no language-specific word stemming, so any language works.
ALTER TABLE "Project" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("key", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("descriptionText", '')), 'C')
) STORED;

ALTER TABLE "Task" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("descriptionText", '')), 'C')
) STORED;

ALTER TABLE "Team" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'C')
) STORED;

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "taskId" UUID,
    "projectId" UUID,
    "parentCommentId" UUID,
    "authorId" UUID NOT NULL,
    "body" JSONB NOT NULL,
    "bodyText" TEXT NOT NULL,
    "editedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("bodyText", '')), 'B')
    ) STORED,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReaction" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "taskId" UUID,
    "commentId" UUID,
    "projectId" UUID,
    "uploaderId" UUID NOT NULL,
    "purpose" VARCHAR(16) NOT NULL DEFAULT 'attachment',
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "bytes" BIGINT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "publicId" TEXT NOT NULL,
    "format" VARCHAR(16),
    "width" INTEGER,
    "height" INTEGER,
    "cloudinaryVersion" VARCHAR(32),
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "readyAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "workspaceId" UUID,
    "projectId" UUID,
    "taskId" UUID,
    "actorId" UUID,
    "category" "ActivityCategory" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" UUID NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "ip" VARCHAR(45),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "interval" "BillingInterval",
    "provider" VARCHAR(20),
    "providerCustomerId" VARCHAR(64),
    "providerSubscriptionId" VARCHAR(64),
    "providerPlanId" VARCHAR(64),
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "scheduledPlanTier" "PlanTier",
    "scheduledInterval" "BillingInterval",
    "trialEndsAt" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "legalName" VARCHAR(120) NOT NULL,
    "email" CITEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'IN',
    "gstin" VARCHAR(15),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID,
    "invoiceId" UUID,
    "provider" VARCHAR(20) NOT NULL,
    "providerPaymentId" VARCHAR(64) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL,
    "method" VARCHAR(32),
    "failureReason" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID,
    "provider" VARCHAR(20) NOT NULL,
    "providerInvoiceId" VARCHAR(64) NOT NULL,
    "number" VARCHAR(64),
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "InvoiceStatus" NOT NULL,
    "periodStart" TIMESTAMPTZ(3),
    "periodEnd" TIMESTAMPTZ(3),
    "issuedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "hostedUrl" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "providerEventId" VARCHAR(128) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLead" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "company" VARCHAR(120) NOT NULL,
    "message" TEXT NOT NULL,
    "source" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" JSONB NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "lastRunAt" TIMESTAMPTZ(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "triggerEvent" JSONB NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_taskId_createdAt_idx" ON "Comment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_createdAt_idx" ON "Comment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- CreateIndex
CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key" ON "CommentReaction"("commentId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_publicId_key" ON "Attachment"("publicId");

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_commentId_idx" ON "Attachment"("commentId");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_status_createdAt_idx" ON "Attachment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_organizationId_createdAt_idx" ON "ActivityLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_taskId_createdAt_idx" ON "ActivityLog"("taskId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_organizationId_category_createdAt_idx" ON "ActivityLog"("organizationId", "category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_createdAt_idx" ON "ActivityLog"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_organizationId_key" ON "BillingProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_providerInvoiceId_key" ON "Invoice"("providerInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_issuedAt_idx" ON "Invoice"("organizationId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookEvent_unprocessed_idx" ON "WebhookEvent"("receivedAt") WHERE ("processedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "SalesLead_createdAt_idx" ON "SalesLead"("createdAt");

-- CreateIndex
CREATE INDEX "Automation_organizationId_isEnabled_idx" ON "Automation"("organizationId", "isEnabled");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_idx" ON "Automation"("workspaceId");

-- CreateIndex
CREATE INDEX "Automation_projectId_idx" ON "Automation"("projectId");

-- CreateIndex
CREATE INDEX "AutomationExecution_automationId_startedAt_idx" ON "AutomationExecution"("automationId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AutomationExecution_organizationId_startedAt_idx" ON "AutomationExecution"("organizationId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_createdAt_idx" ON "AiUsage"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Project_name_trgm_idx" ON "Project" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Task_title_trgm_idx" ON "Task" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Team_searchVector_idx" ON "Team" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Check constraints (hand-edited, PRD §17.3 and §17.7). Prisma cannot describe
-- these, so they live only in this migration. The database rejects any row
-- that breaks them, even if application code has a bug.
-- ============================================================================

-- Ownership only changes through a transfer, never through an invitation.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_role_not_owner" CHECK ("role" <> 'OWNER');

-- End dates cannot come before start dates.
ALTER TABLE "Project" ADD CONSTRAINT "Project_dates_in_order"
  CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Task" ADD CONSTRAINT "Task_dates_in_order"
  CHECK ("dueDate" IS NULL OR "startDate" IS NULL OR "dueDate" >= "startDate");

-- Hours and task numbers are never negative.
ALTER TABLE "Task" ADD CONSTRAINT "Task_hours_not_negative"
  CHECK (("estimatedHours" IS NULL OR "estimatedHours" >= 0) AND ("actualHours" IS NULL OR "actualHours" >= 0));
ALTER TABLE "Task" ADD CONSTRAINT "Task_number_positive" CHECK ("number" > 0);

-- A task cannot block itself.
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_not_self"
  CHECK ("blockingTaskId" <> "blockedTaskId");

-- A comment belongs to exactly one place: a task or a project discussion.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_exactly_one_target"
  CHECK (("taskId" IS NOT NULL)::int + ("projectId" IS NOT NULL)::int = 1);

-- Attachments must point at something; avatars, covers and logos are linked by their owner instead.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_purpose_valid"
  CHECK ("purpose" IN ('attachment', 'avatar', 'cover', 'logo'));
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_has_target"
  CHECK ("purpose" <> 'attachment' OR "taskId" IS NOT NULL OR "commentId" IS NOT NULL OR "projectId" IS NOT NULL);

-- Money and storage counters are never negative.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_storage_not_negative" CHECK ("storageUsedBytes" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_not_negative" CHECK ("amount" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_not_negative" CHECK ("amountDue" >= 0 AND "amountPaid" >= 0);

-- Colors are "#" followed by six hex digits.
ALTER TABLE "TaskStatus" ADD CONSTRAINT "TaskStatus_color_hex" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "Label" ADD CONSTRAINT "Label_color_hex" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
