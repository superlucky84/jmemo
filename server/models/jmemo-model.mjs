import mongoose from "mongoose";

const JmemoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    note: {
      type: String,
      default: ""
    },
    regdate: {
      type: Date,
      default: Date.now
    },
    moddate: {
      type: Date,
      default: Date.now
    },
    favorite: {
      type: Boolean,
      default: false
    },
    category: {
      type: [String],
      default: []
    }
  },
  {
    collection: "jmemos",
    versionKey: false
  }
);

JmemoSchema.index({ title: 1 });
JmemoSchema.index({ moddate: -1 });
JmemoSchema.index({ category: 1 });
JmemoSchema.index({ favorite: -1 });

export const JmemoModel = mongoose.models.Jmemo ?? mongoose.model("Jmemo", JmemoSchema);

