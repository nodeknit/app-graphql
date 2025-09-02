import 'reflect-metadata';
import { Request } from 'express';
import { WhereOptions } from 'sequelize';

// --- Ключи для Reflect Metadata ---
const GQL_MODEL_KEY = Symbol('gql:model');
const GQL_FIELDS_KEY = Symbol('gql:fields');

// --- Типы для GQL конфигурации ---
export interface GQLFieldConfig {
  type?: string;
  nullable?: boolean;
  list?: boolean;
  description?: string;
  resolver?: Function;
  exclude?: boolean;
  customType?: string;
  // Настройки для различных операций
  operations?: {
    query?: boolean;
    mutation?: boolean;
    subscription?: boolean;
  };
}

export interface AuthResult<TAttributes = any> {
  /**
   * Indicates whether the authentication was successful
   */
  success: boolean;
  /**
   * Optional additional WHERE conditions to be merged with the original query.
   * This allows the auth handler to add security filters like user ownership checks.
   */
  where?: WhereOptions<TAttributes>;
  /**
   * Optional list of allowed operations for the current user
   */
  allowedOperations?: string[];
}
export type AuthOperation = 'query' | 'create' | 'update' | 'delete';

export interface GQLModelConfig<TAttributes = any> {
  typeName?: string;
  description?: string;
  exclude?: boolean;
  operations?: {
    query?: boolean;
    mutation?: boolean;
    subscription?: boolean;
  };
  customFields?: Record<string, GQLFieldConfig>;
  excludeFields?: string[];
  // Настройки авторизации
  authRequired?: boolean;
  /**
   * Authentication handler function that validates user access and can modify query conditions.
   *
   * This function is called for every GraphQL operation (query, mutation) when authRequired is true.
   * It receives the Express request object and the current WHERE conditions from the GraphQL query.
   *
   * @param req - Express Request object containing headers, user session, etc.
   * @param where - Sequelize WHERE conditions from the GraphQL query (e.g., { id: "123", status: "active" })
   *
   * @returns AuthResult object or boolean for backward compatibility:
   * - { success: true, where: {...} } - Authentication successful, optionally add/modify WHERE conditions
   * - { success: false } - Authentication failed, access denied
   * - true/false - Legacy boolean return (deprecated but supported)
   *
   * @example
   * ```typescript
   * authHandler: async (req: Request, where: WhereOptions<User>) => {
   *   // Extract JWT token from Authorization header
   *   const token = req.headers.authorization?.replace('Bearer ', '');
   *   if (!token) return { success: false };
   *
   *   // Verify token and get user
   *   const user = await verifyJWT(token);
   *   if (!user) return { success: false };
   *
   *   // Return success with additional security filters
   *   return {
   *     success: true,
   *     where: {
   *       ...where,           // Keep original conditions
   *       userId: user.id     // Add ownership filter
   *     }
   *   };
   * }
   * ```
   *
   * @example Filtering by user ownership
   * ```typescript
   * authHandler: async (req: Request, where: WhereOptions<Post>) => {
   *   const userId = getUserIdFromRequest(req);
   *
   *   return {
   *     success: true,
   *     where: {
   *       ...where,
   *       authorId: userId  // Only show posts by this user
   *     }
   *   };
   * }
   * ```
   *
   * @example Admin-only access
   * ```typescript
   * authHandler: async (req: Request, where: WhereOptions<AdminData>) => {
   *   const user = getUserFromRequest(req);
   *
   *   if (user.role !== 'admin') {
   *     return { success: false };
   *   }
   *
   *   return { success: true, where }; // No additional filters needed
   * }
   * ```
   */
  authHandler?: (req: Request, where: WhereOptions<TAttributes>, operation: AuthOperation) => AuthResult<TAttributes> | Promise<AuthResult<TAttributes>>;
}

// --- Декоратор поля модели ---
export function GQLField(config: GQLFieldConfig = {}) {
  return function (target: any, propertyKey: string) {
    const existingFields: Record<string, GQLFieldConfig> =
      Reflect.getMetadata(GQL_FIELDS_KEY, target.constructor) || {};

    Reflect.defineMetadata(
      GQL_FIELDS_KEY,
      {
        ...existingFields,
        [propertyKey]: config,
      },
      target.constructor
    );
  };
}

// --- Декоратор модели ---
export function GQLModel(config: GQLModelConfig = {}) {
  return function (target: Function) {
    Reflect.defineMetadata(GQL_MODEL_KEY, config, target);
  };
}

// --- Получение метаданных полей ---
export function getGQLFields(target: any): Record<string, GQLFieldConfig> {
  return Reflect.getMetadata(GQL_FIELDS_KEY, target) || {};
}

// --- Получение метаданных модели ---
export function getGQLModelMetadata(target: Function): GQLModelConfig {
  return Reflect.getMetadata(GQL_MODEL_KEY, target) || {};
}

// Legacy aliases for backward compatibility
export const GraphQLField = GQLField;
export const GraphQLModel = GQLModel;
export const getGraphQLFields = getGQLFields;
export const getGraphQLModelMetadata = getGQLModelMetadata;
export type GraphQLFieldConfig = GQLFieldConfig;
export type GraphQLModelConfig = GQLModelConfig;
