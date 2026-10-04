export type ExistingDelivery = { state: string; message: string | null };

export type DeliveryClaimAction = 'claim_new' | 'claim_pending' | 'claim_sandbox' | 'ambiguous' | 'none';

/** Classifies whether a delivery row has never made an external request or may have. */
export function deliveryClaimAction(previous: ExistingDelivery | null): DeliveryClaimAction {
  if (!previous) return 'claim_new';
  if (previous.state === 'sandbox') return 'claim_sandbox';
  if (previous.state === 'pending' && previous.message === null) return 'claim_pending';
  if (previous.state === 'pending' || previous.state === 'failed') return 'ambiguous';
  return 'none';
}
