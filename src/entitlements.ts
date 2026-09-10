/**
 * The single entitlement check. Hustle is free at launch, so every feature is unlocked, but
 * paid features must be easy to switch on later: gate them here and nowhere else.
 */

/** A feature that could one day sit behind a subscription. Named once the first one exists. */
export type Feature = string;

/** Whether the user may use `feature`. Free for everyone until subscriptions arrive. */
export function isUnlocked(_feature: Feature): boolean {
  return true;
}
