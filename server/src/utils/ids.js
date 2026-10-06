import mongoose from "mongoose";

export function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}
