const rawUri = process.env.MONGODB_URI ?? "";
const uri = rawUri.trim();

if (!uri) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

if (!uri.startsWith("mongodb+srv://")) {
  console.error("MONGODB_URI must start with mongodb+srv://");
  process.exit(1);
}

if (uri.includes("<db_password>") || uri.includes("<URL_ENCODED_PASSWORD>")) {
  console.error("Replace password placeholder in MONGODB_URI before running the app.");
  process.exit(1);
}

console.log("MONGODB_URI is configured.");
