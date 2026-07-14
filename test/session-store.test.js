import test from "node:test";
import assert from "node:assert/strict";
import { SessionStore, InMemoryBackend } from "../src/modules/storage/session-store.js";

test("saves and lists sessions newest first", async () => {
  const store = new SessionStore(new InMemoryBackend());
  await store.saveSession({ id: "s1", endedAt: 1000, distance: 500 });
  await store.saveSession({ id: "s2", endedAt: 2000, distance: 800 });
  const list = await store.listSessions();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "s2");
});

test("round-trips settings and returns null when missing", async () => {
  const store = new SessionStore(new InMemoryBackend());
  await store.saveSetting("mode", "precision");
  assert.equal(await store.loadSetting("mode"), "precision");
  assert.equal(await store.loadSetting("missing"), null);
});

test("deletes sessions", async () => {
  const store = new SessionStore(new InMemoryBackend());
  await store.saveSession({ id: "s1", endedAt: 1 });
  await store.deleteSession("s1");
  assert.equal((await store.listSessions()).length, 0);
});
