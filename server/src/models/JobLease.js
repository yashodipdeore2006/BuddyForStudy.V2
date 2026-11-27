import mongoose from "mongoose";

const jobLeaseSchema = new mongoose.Schema({
  jobKey: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  ownerId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  leaseToken: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  leaseUntil: {
    type: Date,
    required: true,
  },
  acquiredAt: {
    type: Date,
    required: true
  },
  renewedAt: {
    type: Date,
    required: true
  },
  releasedAt: {
    type: Date,
    default: null
  },
  // Incremented atomically on every successful acquisition. Downstream jobs
  // can use it as a fencing generation when their writes support fencing.
  fencingToken: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  collection: "job_leases"
});

jobLeaseSchema.index({ jobKey: 1 }, { unique: true, name: "job_lease_key_unique" });
jobLeaseSchema.index({ leaseUntil: 1 }, { name: "job_lease_expiry_lookup" });

export const JobLease = mongoose.models.JobLease
  || mongoose.model("JobLease", jobLeaseSchema);
