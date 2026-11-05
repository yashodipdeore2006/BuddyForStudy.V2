export type ShareResult = "shared" | "copied" | "failed";

export async function shareCourseLink(input: {
  courseId: string;
  title: string;
  text?: string;
}): Promise<ShareResult> {
  const url = new URL("/courses/" + encodeURIComponent(input.courseId), window.location.origin).toString();
  const shareData = { title: input.title, text: input.text || "Explore this course on BuddyForStudy", url };
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(shareData);
      return "shared";
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
    const field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied ? "copied" : "failed";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "failed";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return "copied";
      }
    } catch { /* Report the failure to the caller. */ }
    return "failed";
  }
}
