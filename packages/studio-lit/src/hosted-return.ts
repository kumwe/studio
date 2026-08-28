import type { AuthoringReturnContext } from '@kumwe/studio-protocol';

export const STUDIO_CONTEXTUAL_RETURN_REQUEST_EVENT = 'studio-contextual-return-request';

/** The host-issued opaque return token is the event's entire public payload. */
export interface StudioContextualReturnRequestDetail {
  readonly returnContext: AuthoringReturnContext;
}

/**
 * Request host-controlled close/return navigation without interpreting the
 * opaque key or disposing local drafts. The embedding host owns dirty-state
 * confirmation and navigation.
 */
export function dispatchStudioContextualReturnRequest(
  target: EventTarget,
  returnContext: AuthoringReturnContext,
): boolean {
  return target.dispatchEvent(
    new CustomEvent<StudioContextualReturnRequestDetail>(STUDIO_CONTEXTUAL_RETURN_REQUEST_EVENT, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: { returnContext: structuredClone(returnContext) },
    }),
  );
}
