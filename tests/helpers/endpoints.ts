/**
 * Deployed worker endpoints the app calls, centralised so tests mock them consistently.
 * @module tests/helpers/endpoints
 */

/** Glob matching the live player positions endpoint. */
export const PLAYERS_ROUTE_PATTERN = '**/pvc-players.minecraft-works.workers.dev**';

/** Glob matching the shops data endpoint. */
export const SHOPS_ROUTE_PATTERN = '**/pvc-shops.minecraft-works.workers.dev/**';

/** Regex matching either the local data.json or the shops data endpoint. */
export const SHOPS_OR_DATA_ROUTE_REGEX = /(?:data\.json|pvc-shops\.minecraft-works\.workers\.dev)/;
