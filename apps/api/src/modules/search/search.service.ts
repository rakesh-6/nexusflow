import {
  SEARCH_TYPES,
  taskKey,
  type SearchHit,
  type SearchResults,
  type SearchType,
} from "@nexusflow/shared";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import type { Tenant } from "../../middleware/tenant.ts";
import { accessFor, accessibleProjectsWhere, projectInclude } from "../projects/access.ts";

// Search across an organization (PRD §11.13): tasks (by key or words),
// projects, teams, people and comments, always limited to what the person
// may open (AC-SRCH-02).

interface Query {
  q: string;
  types?: SearchType[] | undefined;
  workspaceId?: string | undefined;
  limit: number;
}

/** "nex 12", "NEX-12" -> { key: "NEX", number: 12 }. */
function keyOf(q: string) {
  const match = /^([A-Za-z0-9]{2,6})[\s-]*(\d{1,9})$/.exec(q.trim());
  return match ? { key: (match[1] as string).toUpperCase(), number: Number(match[2]) } : null;
}

/** "launch pla" -> "launch:* & pla:*", so half-typed words already match. */
function prefixQuery(q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length ? words.map((word) => `${word}:*`).join(" & ") : null;
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export async function search(tenant: Tenant, user: User, query: Query): Promise<SearchResults> {
  const orgId = tenant.organization.id;
  const orgSlug = tenant.organization.slug;
  const orgRole = tenant.membership.role;
  const wanted = new Set(query.types ?? SEARCH_TYPES);
  const results = Object.fromEntries(
    SEARCH_TYPES.map((type) => [type, { items: [] as SearchHit[], total: 0 }]),
  ) as SearchResults;

  const projects = (
    await prisma.project.findMany({
      where: {
        AND: [
          accessibleProjectsWhere(orgId, user.id, orgRole),
          query.workspaceId ? { workspaceId: query.workspaceId } : {},
          { workspace: { deletedAt: null } },
        ],
      },
      include: {
        ...projectInclude(user.id),
        workspace: {
          select: { slug: true, members: { where: { userId: user.id }, select: { role: true } } },
        },
      },
    })
  ).filter((project) => accessFor(project, orgRole));
  const ids = projects.map((project) => project.id);
  const byId = new Map(projects.map((project) => [project.id, project]));
  const taskPath = (projectId: string, number: number) => {
    const project = byId.get(projectId);
    return project
      ? `/${orgSlug}/${project.workspace.slug}/tasks/${taskKey(project.key, number)}`
      : "/";
  };
  const key = keyOf(query.q);
  const prefix = prefixQuery(query.q);
  const pattern = like(query.q);

  if (wanted.has("task") && ids.length) {
    const rows = await prisma.$queryRaw<
      { id: string; number: number; title: string; projectId: string; total: number }[]
    >`
      SELECT t.id, t.number, t.title, t."projectId", count(*) OVER()::int AS total
      FROM "Task" t JOIN "Project" p ON p.id = t."projectId"
      WHERE t."projectId" = ANY(${ids}::uuid[]) AND t."deletedAt" IS NULL AND (
        (p.key = ${key?.key ?? null} AND t.number = ${key?.number ?? null})
        OR t."searchVector" @@ websearch_to_tsquery('simple', ${query.q})
        OR (${prefix}::text IS NOT NULL AND t."searchVector" @@ to_tsquery('simple', coalesce(${prefix}, 'x')))
        OR t.title ILIKE ${pattern}
      )
      ORDER BY
        (p.key = ${key?.key ?? null} AND t.number = ${key?.number ?? null}) DESC NULLS LAST,
        ts_rank_cd(t."searchVector", websearch_to_tsquery('simple', ${query.q})) DESC,
        t."updatedAt" DESC
      LIMIT ${query.limit}`;
    results.task = {
      total: rows[0]?.total ?? 0,
      items: rows.map((row) => {
        const project = byId.get(row.projectId);
        return {
          id: row.id,
          title: `${project ? taskKey(project.key, row.number) : ""} ${row.title}`.trim(),
          subtitle: project?.name ?? null,
          path: taskPath(row.projectId, row.number),
        };
      }),
    };
  }

  if (wanted.has("project")) {
    const matches = projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query.q.toLowerCase()) ||
        project.key === query.q.toUpperCase(),
    );
    results.project = {
      total: matches.length,
      items: matches.slice(0, query.limit).map((project) => ({
        id: project.id,
        title: project.name,
        subtitle: project.key,
        path: `/${orgSlug}/${project.workspace.slug}/projects/${project.key}/board`,
      })),
    };
  }

  // Guests see no teams or people beyond their shared projects.
  if (orgRole !== "GUEST" && (wanted.has("team") || wanted.has("user"))) {
    const admin = orgRole === "OWNER" || orgRole === "ADMIN";
    const teamWhere: Prisma.TeamWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      name: { contains: query.q, mode: "insensitive" },
      workspace: {
        deletedAt: null,
        ...(query.workspaceId ? { id: query.workspaceId } : {}),
        ...(admin ? {} : { members: { some: { userId: user.id } } }),
      },
    };
    const userWhere: Prisma.OrganizationMemberWhereInput = {
      organizationId: orgId,
      status: "ACTIVE",
      user: {
        deletedAt: null,
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { email: { contains: query.q, mode: "insensitive" } },
        ],
      },
    };
    const [teams, teamTotal, members, memberTotal] = await Promise.all([
      wanted.has("team")
        ? prisma.team.findMany({
            where: teamWhere,
            select: {
              id: true,
              name: true,
              slug: true,
              workspace: { select: { slug: true, name: true } },
            },
            take: query.limit,
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      wanted.has("team") ? prisma.team.count({ where: teamWhere }) : Promise.resolve(0),
      wanted.has("user")
        ? prisma.organizationMember.findMany({
            where: userWhere,
            select: { role: true, user: { select: { id: true, name: true, email: true } } },
            take: query.limit,
            orderBy: { user: { name: "asc" } },
          })
        : Promise.resolve([]),
      wanted.has("user")
        ? prisma.organizationMember.count({ where: userWhere })
        : Promise.resolve(0),
    ]);
    results.team = {
      total: teamTotal,
      items: teams.map((team) => ({
        id: team.id,
        title: team.name,
        subtitle: team.workspace.name,
        path: `/${orgSlug}/${team.workspace.slug}/teams/${team.slug}`,
      })),
    };
    results.user = {
      total: memberTotal,
      items: members.map((member) => ({
        id: member.user.id,
        title: member.user.name,
        subtitle: member.user.email,
        path: `/${orgSlug}/settings/org/members`,
      })),
    };
  }

  if (wanted.has("comment") && ids.length) {
    const where: Prisma.CommentWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      bodyText: { contains: query.q, mode: "insensitive" },
      task: { deletedAt: null, projectId: { in: ids } },
    };
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        select: {
          id: true,
          bodyText: true,
          task: { select: { number: true, title: true, projectId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      }),
      prisma.comment.count({ where }),
    ]);
    results.comment = {
      total,
      items: comments.flatMap((comment) =>
        comment.task
          ? [
              {
                id: comment.id,
                title: comment.bodyText.slice(0, 120),
                subtitle: comment.task.title,
                path: taskPath(comment.task.projectId, comment.task.number),
              },
            ]
          : [],
      ),
    };
  }
  return results;
}
