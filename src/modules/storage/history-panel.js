export class HistoryPanel {
  #events;
  #store;
  #root;
  #unsubscribers = [];
  constructor(root, events, store) {
    this.#root = root.querySelector("#history");
    this.#events = events;
    this.#store = store;
    this.#unsubscribers.push(events.on("session.saved", () => this.#render()));
    this.#render();
  }

  destroy() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
  }

  async #render() {
    const sessions = await this.#store.listSessions();
    if (!sessions.length) {
      this.#root.innerHTML = `<section class="dashboard panel"><p class="eyebrow">HISTORIAL</p><h2>Sesiones</h2><p class="empty">Sin partidos guardados.</p></section>`;
      return;
    }
    this.#root.innerHTML = `<section class="dashboard panel"><p class="eyebrow">HISTORIAL</p><h2>Sesiones</h2><ul class="session-list">${sessions.map((session) => this.#row(session)).join("")}</ul></section>`;
    this.#root.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      await this.#store.deleteSession(button.dataset.delete);
      this.#render();
    }));
  }

  #row(session) {
    const date = new Date(session.endedAt);
    const duration = Math.round(session.durationMs / 1000);
    const possession = session.possession == null ? "—" : `${session.possession}%`;
    const label = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    return `<li><div><strong>${label}</strong><span>${session.mode} · ${duration}s · ${session.distance.toFixed(0)} m · ${possession}</span></div><button class="link" data-delete="${session.id}">Eliminar</button></li>`;
  }
}
