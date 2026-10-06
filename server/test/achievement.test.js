import test from "node:test";
import assert from "node:assert/strict";

function nextStreak(lastActivityDate, today, currentStreak) {
  if (lastActivityDate === today) return currentStreak;
  const previous = new Date(today + "T00:00:00+05:30");
  previous.setDate(previous.getDate() - 1);
  const previousKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(previous);
  return lastActivityDate === previousKey ? currentStreak + 1 : 1;
}

test("same-day activity does not increase streak", () => {
  assert.equal(nextStreak("2026-10-06", "2026-10-06", 4), 4);
});

test("consecutive day increases streak", () => {
  assert.equal(nextStreak("2026-10-06", "2026-10-07", 4), 5);
});

test("missed day resets streak", () => {
  assert.equal(nextStreak("2026-10-05", "2026-10-07", 4), 1);
});
