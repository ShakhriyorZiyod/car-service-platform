/**
 * Everything, including the zod contract: for the server and the admin panel. The Mini App
 * imports only types from here and takes values from the dependency-free subpaths
 * (/routes, /format, /vocabulary, /i18n), so zod never reaches its bundle.
 */
export * from './contract';
export * from './format';
export * from './i18n';
export * from './routes';
export * from './vocabulary';
