import type { EndReason, ExerciseId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { StorageService } from '../data/storage.ts';
import { exercises } from '../config/exercises.ts';
import { MetricEngine } from '../metrics/metrics.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { RepDetector } from '../metrics/reps.ts';
import { CalibrationFlow } from './calibration.ts';
import { Emitter } from './emitter.ts';
import { SafetyGate } from './safety.ts';

type State = 'DEMO' | 'REPS' | 'REST';
type Events = { stateChanged: { exerciseId: ExerciseId; state: State }; sessionEnded: { record: any } };
const emitter = new Emitter<Events>();
let exercisesInSession: ExerciseId[] = [];
let index = 0;
let state: State | null = null;

function emitState(): void { emitter.emit('stateChanged', { exerciseId: exercisesInSession[index]!, state: state! }); }
function reset(): void { MetricEngine.reset(); RepDetector.reset(); }

export const SessionController = {
  async start(exerciseIds: ExerciseId[]): Promise<void> {
    if (!(await SafetyGate.isAttested()) && !SafetyGate.isDemoMode()) throw new MirrorWellError('NOT_ATTESTED', 'attestation required');
    if (exerciseIds.length === 0 || exerciseIds.some((id) => !exercises[id]?.blendshapePair)) throw new MirrorWellError('VALIDATION_FAILED', 'invalid exercises');
    const baseline = await StorageService.getActiveBaseline();
    if (!baseline) throw new MirrorWellError('NO_BASELINE', 'no active baseline');
    if (await CalibrationFlow.checkBaselineDrift() === 'recalibrate') throw new MirrorWellError('RECALIBRATION_REQUIRED', 'recalibration required');
    NormalizationLayer.setBaseline(baseline);
    MetricEngine.setBaseline(baseline);
    exercisesInSession = exerciseIds;
    index = 0;
    state = 'DEMO';
    reset();
    emitState();
  },
  advance(): void {
    if (!state) return;
    if (state === 'DEMO') { state = 'REPS'; emitState(); return; }
    if (state === 'REST') {
      if (index === exercisesInSession.length - 1) { void this.stop('completed'); return; }
      index++; state = 'DEMO'; reset(); emitState();
    }
  },
  extendRest(_seconds: number): void {},
  async stop(reason: EndReason): Promise<any> {
    const record = { sessionId: crypto.randomUUID(), endReason: reason, results: [] };
    state = null;
    emitter.emit('sessionEnded', { record });
    return record;
  },
  on<E extends keyof Events>(event: E, callback: (payload: Events[E]) => void): () => void { return emitter.on(event, callback); },
};
