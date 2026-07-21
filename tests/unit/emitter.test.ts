import { describe, expect, it } from 'vitest';
import { Emitter } from '../../src/session/emitter.ts';

describe('Emitter', () => {
  it('emits to subscribers and unsubscribes', () => {
    const emitter = new Emitter<{ tick: number }>();
    const seen: number[] = [];
    const off = emitter.on('tick', (value) => seen.push(value));
    emitter.emit('tick', 1);
    off();
    emitter.emit('tick', 2);
    expect(seen).toEqual([1]);
  });

  it('keeps iterating when a listener unsubscribes during emit', () => {
    const emitter = new Emitter<{ tick: number }>();
    const seen: string[] = [];
    let off: () => void = () => undefined;
    off = emitter.on('tick', () => { seen.push('first'); off(); });
    emitter.on('tick', () => seen.push('second'));
    emitter.emit('tick', 1);
    expect(seen).toEqual(['first', 'second']);
  });
});
