// Main exports
export { AppGraphQL } from './AppGraphQLMain'; // Экспортируем основную реализацию
export * from './decorators';
export * from './utils/configGenerator';
export * from './utils/schemaGenerator';
export * from './abstract/AbstractGraphQLModelConfig';
export * from './lib/GraphQLHelper';
export * from './lib/types';

// Re-export commonly used types
export { Model } from 'sequelize-typescript';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const playgroundPath = join(__dirname, 'playground.html');

// Default export
export { AppGraphQL as default } from './AppGraphQLMain';