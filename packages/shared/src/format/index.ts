/**
 * Display and input formats shared by the server, the bot and both clients. Written by hand
 * rather than with `Intl`, so all of them always agree and old WebViews without the `uz` locale
 * still work. No dependencies, safe for the Mini App bundle.
 */
export * from './datetime';
export * from './duration';
export * from './money';
export * from './phone';
export * from './plate';
export * from './quantity';
