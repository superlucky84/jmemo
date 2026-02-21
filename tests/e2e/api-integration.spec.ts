import { expect, test, type APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

function uniqueTitle(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createNote(request: APIRequestContext, payload: { title: string; note: string; category: string[] }) {
  const response = await request.post(`${API_BASE_URL}/jnote/create`, {
    data: payload
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe.serial("jmemo integration api scenarios", () => {
  test("scenario-1: create/update/read/delete flow", async ({ request }) => {
    const created = await createNote(request, {
      title: uniqueTitle("phase7-create"),
      note: "hello",
      category: ["phase7", "scenario1"]
    });

    const updated = await request.post(`${API_BASE_URL}/jnote/update`, {
      data: {
        id: created._id,
        note: "updated body",
        favorite: true
      }
    });
    expect(updated.ok()).toBeTruthy();

    const readOne = await request.get(`${API_BASE_URL}/jnote/read/${created._id}`);
    expect(readOne.ok()).toBeTruthy();
    const detail = await readOne.json();
    expect(detail.note).toContain("updated body");

    const deleted = await request.post(`${API_BASE_URL}/jnote/delete`, {
      data: { id: created._id }
    });
    expect(deleted.ok()).toBeTruthy();
    expect(await deleted.json()).toEqual({ result: true });
  });

  test("scenario-2: tag OR search and pagination", async ({ request }) => {
    const a = await createNote(request, {
      title: uniqueTitle("phase7-tag-a"),
      note: "A",
      category: ["alpha"]
    });
    const b = await createNote(request, {
      title: uniqueTitle("phase7-tag-b"),
      note: "B",
      category: ["beta"]
    });

    const searched = await request.get(`${API_BASE_URL}/jnote/read`, {
      params: { searchString: "alpha gamma" }
    });
    expect(searched.ok()).toBeTruthy();
    const searchPayload = await searched.json();
    const list = Array.isArray(searchPayload) ? searchPayload : searchPayload.items;
    expect(list.some((item: { _id: string }) => item._id === a._id)).toBeTruthy();

    const paged = await request.get(`${API_BASE_URL}/jnote/read`, {
      params: { page: "1", pageSize: "1" }
    });
    expect(paged.ok()).toBeTruthy();
    const pagedPayload = await paged.json();
    expect(Array.isArray(pagedPayload)).toBe(false);
    expect(pagedPayload.pageSize).toBe(1);

    await request.post(`${API_BASE_URL}/jnote/delete`, { data: { id: a._id } });
    await request.post(`${API_BASE_URL}/jnote/delete`, { data: { id: b._id } });
  });

  test("scenario-3: image upload and note cleanup path", async ({ request }) => {
    const upload = await request.post(`${API_BASE_URL}/jnote/upload`, {
      multipart: {
        pict: {
          name: "phase7.png",
          mimeType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
        }
      }
    });
    expect(upload.ok()).toBeTruthy();
    const uploaded = await upload.json();
    expect(uploaded.filepath).toMatch(/^images\/\d{8}\//);

    const created = await createNote(request, {
      title: uniqueTitle("phase7-image"),
      note: `![phase7](${uploaded.filepath})`,
      category: ["phase7", "image"]
    });

    const deleted = await request.post(`${API_BASE_URL}/jnote/delete`, {
      data: { id: created._id }
    });
    expect(deleted.ok()).toBeTruthy();
  });

  test("scenario-4: health smoke", async ({ request }) => {
    const live = await request.get(`${API_BASE_URL}/health/live`);
    expect(live.ok()).toBeTruthy();

    const ready = await request.get(`${API_BASE_URL}/health/ready`);
    expect(ready.ok()).toBeTruthy();
  });
});
