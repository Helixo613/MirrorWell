// Remembers the companion session id after SessionScreen unmounts, so the summary screen can
// ask the backend about it. In-memory only; never persisted.
let lastId: string | null = null;
export const companionSession = {
  set(id: string | null) {
    lastId = id;
  },
  get(): string | null {
    return lastId;
  },
};
