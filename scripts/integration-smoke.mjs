const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

async function run() {
  const live = await requestJson("/health/live");
  const ready = await requestJson("/health/ready");

  const created = await requestJson("/jnote/create", {
    method: "POST",
    body: JSON.stringify({
      title: `smoke-${Date.now()}`,
      note: "integration smoke",
      category: ["smoke"]
    })
  });

  await requestJson(`/jnote/read/${created._id}`);

  await requestJson("/jnote/delete", {
    method: "POST",
    body: JSON.stringify({ id: created._id })
  });

  console.log(
    JSON.stringify({
      result: "OK",
      baseUrl,
      live: live?.ok ?? false,
      ready: ready?.ok ?? false,
      createdId: created._id
    })
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      result: "FAILED",
      baseUrl,
      message: error?.message ?? String(error)
    })
  );
  process.exit(1);
});
