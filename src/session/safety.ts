// Stub per docs/IMPLEMENTATION.md Task 2 ("stub the import until Task 9"). Task 9 implements
// the real gate (UNATTESTED/ATTESTED/DEMO) per docs/API.md §2. StorageService's demo-mode
// write backstop needs SafetyGate.isDemoMode() to exist now; it must never actually be true
// until Task 9 wires real demo-mode entry.
export const SafetyGate = {
  isDemoMode(): boolean {
    return false;
  },
};
