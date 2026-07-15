export class InsightPanel {
  #events;
  #store;
  #root;
  #unsubscribers = [];
  constructor(root, events, store) {
    this.#root = root?.querySelector("#insights");
    this.#events = events;
    this.#store = store;
    this.#unsubscribers.push(events.on("session.saved", (event) => this.#render(event.detail)));
    this.#renderLatest();
  }

  destroy() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
  }

  async #renderLatest() {
    if (!this.#root) return;
    const sessions = await this.#store.listSessions();
    if (sessions.length) this.#render(sessions[0]);
  }

  #render(session) {
    if (!this.#root) return;
    const items = (session.insights || []).map((text) => `<li>${text}</li>`).join("");
    this.#root.innerHTML = `<section class="dashboard panel"><p class="eyebrow">INFORME TACTICO</p><h2>Insights de la sesión</h2><ul class="insight-list">${items || '<li class="empty">Sin datos.</li>'}</ul></section>`;
  }
}
