import mongoose from "mongoose";

const progressSyncOperationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  operationId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64
  },
  requestHash: {
    type: String,
    required: true,
    minlength: 64,
    maxlength: 64
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  action: {
    type: String,
    enum: ["complete", "uncomplete"],
    required: true
  },
  clientSequence: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ["processing", "succeeded", "rejected", "retryable"],
    required: true,
    default: "processing"
  },
  leaseToken: {
    type: String,
    default: null,
    maxlength: 64
  },
  leaseUntil: {
    type: Date,
    default: null
  },
  attempts: {
    type: Number,
    default: 1,
    min: 0
  },
  errorStatus: {
    type: Number,
    default: null,
    min: 400,
    max: 599
  },
  errorCode: {
    type: String,
    default: "",
    maxlength: 80
  },
  errorMessage: {
    type: String,
    default: "",
    maxlength: 240
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "progress_sync_operations"
});

progressSyncOperationSchema.index(
  { user: 1, operationId: 1 },
  { unique: true, name: "progress_sync_user_operation_unique" }
);
progressSyncOperationSchema.index(
  { status: 1, leaseUntil: 1 },
  { name: "progress_sync_claim_recovery" }
);
progressSyncOperationSchema.index(
  { user: 1, course: 1, clientSequence: 1 },
  { name: "progress_sync_user_course_sequence" }
);

export const ProgressSyncOperation = mongoose.models.ProgressSyncOperation
  || mongoose.model("ProgressSyncOperation", progressSyncOperationSchema);
