/** A lightweight event boundary between application modules. */
export class EventBus {
  #target = new EventTarget();

  on(type, listener, options) {
    this.#target.addEventListener(type, listener, options);
    return () => this.#target.removeEventListener(type, listener, options);
  }

  emit(type, detail = {}) {
    this.#target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
