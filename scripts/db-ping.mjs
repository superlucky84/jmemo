import { MongoClient } from "mongodb";

const uri = (process.env.MONGODB_URI ?? "").trim();

if (!uri) {
  console.error("Missing MONGODB_URI. Set it in .env first.");
  process.exit(1);
}

let client;

try {
  client = new MongoClient(uri);
  await client.connect();

  const admin = client.db().admin();
  const result = await admin.ping();

  if (result?.ok === 1) {
    console.log("Atlas ping ok: 1");
  } else {
    console.error("Atlas ping failed:", result);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Atlas ping error:", error?.message ?? error);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.close();
  }
}
