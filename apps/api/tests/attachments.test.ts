import { afterAll, describe, expect, it } from "vitest";
import { sentJobs } from "../src/lib/jobs.ts";
import { prisma } from "../src/lib/prisma.ts";
import { testStorage } from "../src/lib/storage/files.ts";
import { createTestClient } from "./helpers/http.ts";
import { orgHelpers } from "./helpers/orgs.ts";

// File attachments with the in-memory storage stand-in (PRD §11.11, AC-FILE-01…05).
const client = createTestClient("files-test.example");
const { post } = client;
const { verifiedUser, createOrg, joinedMember } = orgHelpers(client);
type Agent = ReturnType<typeof client.newAgent>;

const SLOW = { timeout: 300_000 };
const MB = 1024 * 1024;

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

async function setup() {
  const owner = await verifiedUser();
  const slug = await createOrg(owner.agent);
  const api = `/orgs/${slug}`;
  const project = await post(owner.agent, `${api}/workspaces/general/projects`, {
    name: "Files",
    key: `F${Date.now() % 100000}`.slice(0, 6),
  }).expect(201);
  const task = await post(owner.agent, `${api}/projects/${project.body.data.id}/tasks`, {
    title: "With files",
  }).expect(201);
  const viewer = await joinedMember(owner.agent, slug);
  const storageUsed = async () =>
    Number((await prisma.organization.findUniqueOrThrow({ where: { slug } })).storageUsedBytes);
  return { owner, viewer, api, taskId: task.body.data.id as string, storageUsed };
}

function sign(agent: Agent, api: string, body: object) {
  return post(agent, `${api}/attachments/sign`, body);
}

describe("signing and checking uploads (AC-FILE-01, 02, 05)", SLOW, () => {
  it("refuses big, disallowed and fake files and leaves the storage counter alone", async () => {
    const { owner, api, taskId, storageUsed } = await setup();

    const big = await sign(owner.agent, api, {
      taskId,
      fileName: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 30 * MB,
    }).expect(402);
    expect(big.body.error).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      details: { limit: "maxFileBytes" },
    });

    await sign(owner.agent, api, {
      taskId,
      fileName: "evil.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 1000,
    }).expect(400);

    // A ".jpg" that is really something else is destroyed and refused.
    const fake = await sign(owner.agent, api, {
      taskId,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    }).expect(201);
    const fakeId = fake.body.data.fields.public_id as string;
    testStorage.put(fakeId, { bytes: 1000, format: "exe" });
    const refused = await post(
      owner.agent,
      `${api}/attachments/${fake.body.data.attachmentId}/confirm`,
    ).expect(400);
    expect(refused.body.error.code).toBe("UPLOAD_INVALID");
    expect(testStorage.destroyed).toContain(fakeId);
    expect(
      await prisma.attachment.findUnique({ where: { id: fake.body.data.attachmentId } }),
    ).toBeNull();

    // Declared small, but Cloudinary says it is 20 MB.
    const sneaky = await sign(owner.agent, api, {
      taskId,
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 1000,
    }).expect(201);
    testStorage.put(sneaky.body.data.fields.public_id, { bytes: 20 * MB, format: "png" });
    await post(owner.agent, `${api}/attachments/${sneaky.body.data.attachmentId}/confirm`).expect(
      400,
    );
    expect(await storageUsed()).toBe(0);
  });
});

describe("using and removing files (AC-FILE-03, 04)", SLOW, () => {
  it("lists files, signs 15-minute links for members, and counts storage", async () => {
    const { owner, viewer, api, taskId, storageUsed } = await setup();
    const signed = await sign(owner.agent, api, {
      taskId,
      fileName: "../Report Q3.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2000,
    }).expect(201);
    const attachmentId = signed.body.data.attachmentId as string;
    const publicId = signed.body.data.fields.public_id as string;
    testStorage.put(publicId, { bytes: 2048, format: "pdf" });
    const ready = await post(owner.agent, `${api}/attachments/${attachmentId}/confirm`).expect(200);
    expect(ready.body.data).toMatchObject({
      originalName: "Report Q3.pdf",
      bytes: 2048,
      kind: "IMAGE",
    });
    expect(await storageUsed()).toBe(2048);

    const list = await viewer.agent.get(`/api/v1${api}/tasks/${taskId}/attachments`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].canDelete).toBe(false);
    const task = await owner.agent.get(`/api/v1${api}/tasks/${taskId}`).expect(200);
    expect(task.body.data.attachmentCount).toBe(1);

    // AC-FILE-03: members get a link that expires within 15 minutes; outsiders get 404.
    const link = await viewer.agent
      .get(`/api/v1${api}/attachments/${attachmentId}/url`)
      .expect(200);
    const expires = new Date(link.body.data.expiresAt).getTime() - Date.now();
    expect(expires).toBeGreaterThan(0);
    expect(expires).toBeLessThanOrEqual(15 * 60_000);
    const outsider = await verifiedUser();
    await createOrg(outsider.agent);
    for (const request of [
      outsider.agent.get(`/api/v1${api}/attachments/${attachmentId}/url`),
      outsider.agent.get(`/api/v1${api}/tasks/${taskId}/attachments`),
      post(outsider.agent, `${api}/attachments/${attachmentId}/confirm`),
      post(outsider.agent, `${api}/attachments/sign`, {
        taskId,
        fileName: "a.png",
        mimeType: "image/png",
        sizeBytes: 10,
      }),
      client.del(outsider.agent, `${api}/attachments/${attachmentId}`),
    ]) {
      expect((await request).status).toBe(404);
    }

    // Viewers cannot upload or remove; the uploader removes it once (AC-FILE-04).
    await sign(viewer.agent, api, {
      taskId,
      fileName: "a.png",
      mimeType: "image/png",
      sizeBytes: 10,
    }).expect(403);
    await client.del(viewer.agent, `${api}/attachments/${attachmentId}`).expect(403);
    await client.del(owner.agent, `${api}/attachments/${attachmentId}`).expect(200);
    expect(await storageUsed()).toBe(0);
    const destroys = sentJobs.filter(
      (job) => job.name === "storage.destroy" && job.data["publicId"] === publicId,
    );
    expect(destroys).toHaveLength(1);
    await owner.agent.get(`/api/v1${api}/attachments/${attachmentId}/url`).expect(404);
  });
});
