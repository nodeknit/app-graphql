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