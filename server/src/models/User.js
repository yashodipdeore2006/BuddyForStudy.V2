import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      select: false
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true
    },
    emailVerified: {
      type: Boolean,
      default: false,
      required: true
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "local_google"],
      default: "local"
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    profileImage: {
      type: String,
      default: ""
    }
  },
  { timestamps: true, collection: "users" }
);

userSchema.methods.comparePassword = function comparePassword(password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

export const User = mongoose.model("User", userSchema);
