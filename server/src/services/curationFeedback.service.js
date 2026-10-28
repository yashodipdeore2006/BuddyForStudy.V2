export async function persistCurationFeedback({ model, payload, submissionId }) {
  if (!submissionId) return model.create(payload);

  try {
    const feedback = await model.findOneAndUpdate(
      { submissionId },
      { $setOnInsert: { ...payload, submissionId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (!feedback) throw new Error("Curation feedback could not be persisted.");
    return feedback;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await model.findOne({ submissionId });
    if (!existing) throw error;
    return existing;
  }
}
