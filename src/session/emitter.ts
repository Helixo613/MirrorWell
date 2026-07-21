export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(value: Events[keyof Events]) => void>>();

  on<E extends keyof Events>(event: E, callback: (value: Events[E]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback as (value: Events[keyof Events]) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(callback as (value: Events[keyof Events]) => void);
  }

  emit<E extends keyof Events>(event: E, value: Events[E]): void {
    for (const callback of [...(this.listeners.get(event) ?? [])]) callback(value);
  }
}
