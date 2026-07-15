export class HistoryPanel {
  #events;
  #store;
  #root;
  #unsubscribers = [];

  constructor(root, events, store) {
    this.#root = root?.querySelector("#history");
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
      this.#root.innerHTML = `<div class="rounded-xl p-6 text-center" style="background:rgba(16,24,39,.8);border:1px solid #263148;color:#c2cab0"><p style="font-size:1rem">Sin sesiones guardadas.</p></div>`;
      return;
    }
    this.#root.innerHTML = sessions.map((s) => this.#row(s)).join("");
    this.#root.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", (e) => {
      const id = btn.dataset.view;
      const detail = this.#root.querySelector(`[data-detail="${id}"]`);
      if (detail) { detail.hidden = !detail.hidden; return; }
      this.#store.getSession(id).then((session) => {
        if (!session) return;
        const row = btn.closest(".session-row");
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
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    const pos = session.possession == null ? "—" : `${session.possession}%`;
    const ev = (session.events || []).length;
    const label = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const modeLabel = session.mode || "balanced";
    return `<div class="session-row rounded-xl flex flex-wrap items-center justify-between p-6 gap-4 transition-all" style="background:rgba(16,24,39,.8);border:1px solid #263148;cursor:pointer">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-lg flex items-center justify-center" style="background:#122033;border:1px solid #263148">
          <span class="material-symbols-outlined" style="color:#aff73f">sports_soccer</span>
        </div>
        <div>
          <div style="font-size:1.1rem;font-weight:600;color:#ffffff">${label}</div>
          <div class="flex items-center gap-2" style="font-size:.82rem;color:#c2cab0">
            <span>${modeLabel}</span>
            <span>•</span>
            <span>${mins}' ${String(secs).padStart(2,"0")}"</span>
            <span class="px-1.5 rounded text-[10px] uppercase font-bold" style="background:#283549;color:#ffffff">${ev} eventos</span>
          </div>
        </div>
      </div>
      <div class="flex gap-6 text-center">
        <div><p class="text-[10px] uppercase font-bold tracking-widest" style="color:#c2cab0">Distancia</p><p style="font-size:1.1rem;font-weight:600;color:#ffffff">${(session.distance / 1000).toFixed(1)} km</p></div>
        <div><p class="text-[10px] uppercase font-bold tracking-widest" style="color:#c2cab0">Posesión</p><p style="font-size:1.1rem;font-weight:600;color:#ffffff">${pos}</p></div>
      </div>
      <div class="flex gap-2">
        <button data-view="${session.id}" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all" style="background:#283549;color:#d5e3fd;cursor:pointer">Ver</button>
        <button data-delete="${session.id}" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all" style="background:#93000a;color:#ffb4ab;cursor:pointer">Eliminar</button>
      </div>
    </div>`;
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
      return `<div class="relative pl-5" style="border-left:2px solid #263148"><p style="font-weight:600;color:#d5e3fd;font-size:.85rem">${m}:${String(s).padStart(2, "0")} - ${ev.label}</p></div>`;
    }).join("");
    const ins = (session.insights || []).map((t) =>
      `<li class="flex gap-3"><span class="material-symbols-outlined" style="color:#aff73f;font-size:1rem">check_circle</span><p style="color:#d5e3fd;font-size:.85rem">${t}</p></li>`
    ).join("");
    return `<div class="p-6 border-t grid grid-cols-1 lg:grid-cols-12 gap-6" style="border-color:#263148;background:rgba(16,24,39,.8)">
      <div class="lg:col-span-8 space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 rounded-lg border" style="background:#0e1c2f;border-color:#263148">
            <p class="text-[11px] font-bold uppercase mb-1" style="color:#c2cab0">Duración</p>
            <p style="font-size:1.1rem;font-weight:600;color:#ffffff">${mins}' ${String(secs).padStart(2,"0")}"</p>
          </div>
          <div class="p-4 rounded-lg border" style="background:#0e1c2f;border-color:#263148">
            <p class="text-[11px] font-bold uppercase mb-1" style="color:#c2cab0">Distancia</p>
            <p style="font-size:1.1rem;font-weight:600;color:#ffffff">${session.distance.toFixed(0)} m</p>
          </div>
          <div class="p-4 rounded-lg border" style="background:#0e1c2f;border-color:#263148">
            <p class="text-[11px] font-bold uppercase mb-1" style="color:#c2cab0">Vel. Máx</p>
            <p style="font-size:1.1rem;font-weight:600;color:#ffffff">${session.maxSpeed.toFixed(1)} m/s</p>
          </div>
          <div class="p-4 rounded-lg border" style="background:#0e1c2f;border-color:#263148">
            <p class="text-[11px] font-bold uppercase mb-1" style="color:#c2cab0">Posesión A</p>
            <p style="font-size:1.1rem;font-weight:600;color:#ffffff">${pos}</p>
          </div>
        </div>
        ${events ? `<div class="p-4 rounded-xl border" style="background:#0e1c2f;border-color:#263148">
          <h4 style="font-size:1rem;font-weight:600;color:#ffffff;margin-bottom:12px">Timeline de Eventos</h4>
          <div class="space-y-3">${events}</div>
        </div>` : ""}
      </div>
      <div class="lg:col-span-4">
        <div class="p-4 rounded-xl border h-full" style="background:rgba(175,247,63,.03);border-color:rgba(175,247,63,.2)">
          <div class="flex items-center gap-2 mb-4" style="color:#aff73f">
            <span class="material-symbols-outlined">insights</span>
            <h4 style="font-size:1rem;font-weight:600">Tactical Insights</h4>
          </div>
          ${ins ? `<ul class="space-y-4">${ins}</ul>` : `<p style="color:#c2cab0;font-size:.85rem">Sin insights disponibles.</p>`}
        </div>
      </div>
    </div>`;
  }
}
