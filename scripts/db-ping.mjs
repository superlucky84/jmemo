import { MongoClient } from "mongodb";
import { validateMongoUri } from "../src/shared/env.mjs";

let uri;

try {
  uri = validateMongoUri(process.env.MONGODB_URI);
} catch (error) {
  console.error(error?.message ?? error);
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
