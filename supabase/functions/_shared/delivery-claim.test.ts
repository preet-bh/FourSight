import { describe, expect, it } from 'vitest';
import { deliveryClaimAction } from './delivery-claim';

describe('delivery claim classification', () => {
  it('claims an initial pending row created with a report', () => {
    expect(deliveryClaimAction({ state: 'pending', message: null })).toBe('claim_pending');
  });

  it('does not retry a pending row after submission has started', () => {
    expect(deliveryClaimAction({ state: 'pending', message: 'Submitting to Boston 311.' })).toBe('ambiguous');
  });

  it('does not retry an ambiguous failed attempt', () => {
    expect(deliveryClaimAction({ state: 'failed', message: 'Network response was lost.' })).toBe('ambiguous');
  });

  it('allows a saved sandbox result to be retried when delivery is configured', () => {
    expect(deliveryClaimAction({ state: 'sandbox', message: 'Credentials are not configured.' })).toBe('claim_sandbox');
  });
});
