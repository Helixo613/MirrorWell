import { describe, expect, it } from 'vitest';
import { greetingFor } from '../../src/screens/home/homeHelpers';

describe('greetingFor', () => {
  it('uses morning, afternoon, and evening buckets', () => {
    expect(greetingFor(0, 'Ravi')).toBe('Good morning, Ravi');
    expect(greetingFor(12, 'Ravi')).toBe('Good afternoon, Ravi');
    expect(greetingFor(18, 'Ravi')).toBe('Good evening, Ravi');
  });

  it('omits the nickname when none was saved', () => {
    expect(greetingFor(9, undefined)).toBe('Good morning');
  });
});
