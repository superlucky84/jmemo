import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    regdate: {
      type: Date,
      default: Date.now
    },
    moddate: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "categories",
    versionKey: false
  }
);

export const CategoryModel =
  mongoose.models.Category ?? mongoose.model("Category", CategorySchema);

