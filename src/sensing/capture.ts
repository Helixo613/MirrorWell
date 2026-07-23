// src/sensing/capture.ts — owns the camera lifecycle and frame loop; nothing else
// (docs/BACKEND.md §1.1). Contracts: docs/API.md §4.
import { MirrorWellError } from '../data/errors.ts';
import { log } from '../log.ts';

type FrameCallback = (video: HTMLVideoElement, timestampMs: number) => void;

// lib.dom.d.ts declares requestVideoFrameCallback/cancelVideoFrameCallback as always-present
// on HTMLVideoElement, but real-world support varies (Firefox lacked it for years) — the
// runtime `typeof` checks below are the actual feature detection; the type is a formality.
let stream: MediaStream | null = null;
let videoEl: HTMLVideoElement | null = null;
const subscribers = new Set<FrameCallback>();
// Abort listeners (docs/API.md §4 `onStop`). A frame subscriber CANNOT simply be dropped by
// stop(): SessionScreen pauses by stopping the camera and resuming it later WITHOUT
// re-subscribing (useSessionScreen), so clearing the set here would silently kill the session
// on resume. Instead stop() announces itself, and the one kind of consumer that cannot survive
// it — a capture window that only ever closes on an arriving frame — unsubscribes itself.
const stopSubscribers = new Set<() => void>();
let running = false;
let processingFrame = false;
let useVideoFrameCallback = false;
let strategyDetected = false;
let scheduledHandle: number | null = null;

function mapGetUserMediaError(err: unknown): MirrorWellError {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  // NotAllowedError/SecurityError/PermissionDeniedError = user refused. Everything else
  // (NotFoundError, NotReadableError, OverconstrainedError, AbortError, ...) = no usable
  // device right now — docs/API.md §4 only distinguishes these two buckets.
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new MirrorWellError('CAMERA_DENIED', message);
  }
  return new MirrorWellError('CAMERA_UNAVAILABLE', message);
}

function detectFrameLoopStrategy(video: HTMLVideoElement): void {
  if (strategyDetected) return;
  useVideoFrameCallback = typeof video.requestVideoFrameCallback === 'function';
  strategyDetected = true;
  log.info('CaptureService', `frame loop strategy: ${useVideoFrameCallback ? 'requestVideoFrameCallback' : 'requestAnimationFrame'}`);
}

function scheduleNext(video: HTMLVideoElement): void {
  if (!running) return;
  if (useVideoFrameCallback) {
    scheduledHandle = video.requestVideoFrameCallback!((_now, metadata) => tick(video, metadata.mediaTime * 1000));
  } else {
    scheduledHandle = requestAnimationFrame((now) => tick(video, now));
  }
}

function tick(video: HTMLVideoElement, timestampMs: number): void {
  if (!running) return;
  if (processingFrame) {
    // Latest-frame-wins: drop this tick's callback fan-out but keep the loop alive
    // (docs/BACKEND.md §1.1 — never queue frames).
    scheduleNext(video);
    return;
  }
  processingFrame = true;
  try {
    for (const cb of subscribers) cb(video, timestampMs);
  } finally {
    processingFrame = false;
  }
  scheduleNext(video);
}

async function start(constraints?: MediaTrackConstraints): Promise<void> {
  if (running) return;

  let acquiredStream: MediaStream;
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, ...constraints },
    });
  } catch (err) {
    throw mapGetUserMediaError(err);
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = acquiredStream;
  await video.play();

  stream = acquiredStream;
  videoEl = video;
  running = true;
  detectFrameLoopStrategy(video);
  scheduleNext(video);
}

function stop(): void {
  running = false;
  if (scheduledHandle !== null) {
    if (useVideoFrameCallback) {
      videoEl?.cancelVideoFrameCallback?.(scheduledHandle);
    } else {
      cancelAnimationFrame(scheduledHandle);
    }
    scheduledHandle = null;
  }
  // Release every track — this is what actually turns the camera light off.
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  videoEl = null;
  strategyDetected = false;
  // Announced last, with the camera already released, so a listener that tears itself down (and
  // may re-enter stop() through its own frame-source teardown) finds nothing left to release.
  // Snapshot: every listener unsubscribes itself from inside this loop.
  for (const cb of [...stopSubscribers]) cb();
}

function onFrame(cb: FrameCallback): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function onStop(cb: () => void): () => void {
  stopSubscribers.add(cb);
  return () => stopSubscribers.delete(cb);
}

function isRunning(): boolean {
  return running;
}

export const CaptureService = { start, stop, onFrame, onStop, isRunning };
