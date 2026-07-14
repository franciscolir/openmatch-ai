const DB_NAME = "openmatch-ai";
const DB_VERSION = 1;
const STORE_SESSIONS = "sessions";
const STORE_SETTINGS = "settings";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBBackend {
  #dbPromise;
  #db() {
    if (!this.#dbPromise) this.#dbPromise = openDb();
    return this.#dbPromise;
  }
  async put(store, value) {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async get(store, key) {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async getAll(store) {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async delete(store, key) {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export class InMemoryBackend {
  #stores = { sessions: new Map(), settings: new Map() };
  async put(store, value) { this.#stores[store].set(value.id ?? value.key, value); }
  async get(store, key) { return this.#stores[store].get(key) || null; }
  async getAll(store) { return [...this.#stores[store].values()]; }
  async delete(store, key) { this.#stores[store].delete(key); }
}

export class SessionStore {
  #backend;
  constructor(backend) { this.#backend = backend; }
  saveSession(session) { return this.#backend.put(STORE_SESSIONS, session); }
  async listSessions() {
    const all = await this.#backend.getAll(STORE_SESSIONS);
    return all.sort((first, second) => second.endedAt - first.endedAt);
  }
  getSession(id) { return this.#backend.get(STORE_SESSIONS, id); }
  deleteSession(id) { return this.#backend.delete(STORE_SESSIONS, id); }
  saveSetting(key, value) { return this.#backend.put(STORE_SETTINGS, { key, value }); }
  async loadSetting(key) {
    const row = await this.#backend.get(STORE_SETTINGS, key);
    return row ? row.value : null;
  }
}
