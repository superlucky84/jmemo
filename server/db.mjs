import mongoose from "mongoose";

export async function connectMongo(uri) {
  await mongoose.connect(uri, {
    dbName: "jmemo"
  });
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

export async function pingMongo() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }

  await mongoose.connection.db.admin().ping();
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

