import { test } from "node:test";
import assert from "node:assert/strict";
import { unreadCount } from "./unread.js";

test("the unread count comes from the title", () => {
  assert.equal(unreadCount("Inbox (3) - user@example.com - Gmail"), 3);
  assert.equal(unreadCount("Chat (1,204)"), 1204);
  assert.equal(unreadCount("(99+) Chat"), 99);
});

test("a title with no count is zero", () => {
  assert.equal(unreadCount("Inbox - user@example.com - Gmail"), 0);
  assert.equal(unreadCount("Meeting (Room 4)"), 0);
  assert.equal(unreadCount(""), 0);
  assert.equal(unreadCount(undefined), 0);
});
