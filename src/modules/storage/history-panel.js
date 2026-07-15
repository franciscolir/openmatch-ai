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
    this.#root.innerHTML = `<section class="dashboard panel"><p class="eyebrow">HISTORIAL</p><h2>Sesiones</h2><ul class="session-list">${sessions.map((s) => this.#row(s)).join("")}</ul></section>`;
    this.#root.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", (e) => {
      const id = btn.dataset.view;
      const detail = this.#root.querySelector(`[data-detail="${id}"]`);
      if (detail) { detail.hidden = !detail.hidden; return; }
      this.#store.getSession(id).then((session) => {
        if (!session) return;
        const row = btn.closest("li");
        const div = document.createElement("div");
        div.dataset.detail = id;
        div.hidden = false;
        div.innerHTML = this.#detail(session);
        row.after(div);
      });
    }));
    this.#root.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.#store.deleteSession(btn.dataset.delete);
      this.#render();
    }));
  }

  #row(session) {
    const date = new Date(session.endedAt);
    const dur = Math.round(session.durationMs / 1000);
    const pos = session.possession == null ? "—" : `${session.possession}% A`;
    const label = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    const events = (session.events || []).length;
    return `<li><div><strong>${label}</strong><span>${session.mode} · ${dur}s · ${session.distance.toFixed(0)}m · ${pos}${events ? ` · ${events} eventos` : ""}</span></div><div><button class="link" data-view="${session.id}">Ver</button><button class="link" data-delete="${session.id}">Eliminar</button></div></li>`;
  }

  #detail(session) {
    const dur = Math.round(session.durationMs / 1000);
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    const pos = session.possession == null ? "—" : `${session.possession}%`;
    const events = (session.events || []).map((ev) => {
      const sec = Math.round(ev.timestamp / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `<li><time>${m}:${String(s).padStart(2, "0")}</time> ${ev.label}</li>`;
    }).join("");
    const ins = (session.insights || []).map((t) => `<li>${t}</li>`).join("");
    return `<div class="session-detail">
      <dl class="session-stats">
        <div><dt>Duración</dt><dd>${mins}m ${secs}s</dd></div>
        <div><dt>Modo</dt><dd>${session.mode}</dd></div>
        <div><dt>Distancia total</dt><dd>${session.distance.toFixed(0)} m</dd></div>
        <div><dt>Velocidad máxima</dt><dd>${session.maxSpeed.toFixed(1)} m/s</dd></div>
        ${session.teamDistanceA != null ? `<div><dt>Distancia Equipo A</dt><dd>${session.teamDistanceA.toFixed(0)} m</dd></div>` : ""}
        ${session.teamDistanceB != null ? `<div><dt>Distancia Equipo B</dt><dd>${session.teamDistanceB.toFixed(0)} m</dd></div>` : ""}
        <div><dt>Posesión A / B</dt><dd>${pos} / ${pos !== "—" ? (100 - session.possession) + "%" : "—"}</dd></div>
      </dl>
      ${events ? `<div class="session-events"><h4>Eventos (${session.events.length})</h4><ol class="event-list">${events}</ol></div>` : ""}
      ${ins ? `<div class="session-insights"><h4>Insights tácticos</h4><ul class="insight-list">${ins}</ul></div>` : ""}
    </div>`;
  }
}
