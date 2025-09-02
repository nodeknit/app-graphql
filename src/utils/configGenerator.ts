import { ModelCtor, Model } from 'sequelize-typescript';
import { 
  GraphQLModelConfig, 
  GraphQLFieldConfig, 
  getGraphQLFields, 
  getGraphQLModelMetadata 
} from '../decorators';
import { AbstractGraphQLModelConfig } from '../abstract/AbstractGraphQLModelConfig';

export interface GenerateGraphQLConfigOptions {
  /**
   * Поля, которые нужно исключить полностью
   */
  excludeFields?: string[];

  /**
   * Принудительное переопределение конфигурации модели
   */
  override?: Partial<GraphQLModelConfig>;

  /**
   * Включить операции по умолчанию
   */
  enableOperations?: {
    query?: boolean;
    mutation?: boolean;
    subscription?: boolean;
  };
}

/**
 * Генератор GraphQL конфигурации из декораторов модели
 */
export function generateGraphQLModelConfig(
  modelClass: ModelCtor<Model>,
  options: GenerateGraphQLConfigOptions = {}
): AbstractGraphQLModelConfig {
  const fieldMeta = getGraphQLFields(modelClass);
  const modelMeta = getGraphQLModelMetadata(modelClass);
  const exclude = new Set(options.excludeFields ?? ['createdAt', 'updatedAt']);

  const config: GraphQLModelConfig = {
    typeName: modelMeta.typeName ?? modelClass.name,
    description: modelMeta.description,
    exclude: modelMeta.exclude ?? false,
    operations: {
      query: true,
      mutation: false,
      subscription: false,
      ...modelMeta.operations,
      ...options.enableOperations
    },
    customFields: {},
    excludeFields: Array.from(exclude),
    ...options.override,
    ...modelMeta
  };

  // Обработка полей с метаданными
  for (const [fieldName, fieldConfig] of Object.entries(fieldMeta)) {
    if (exclude.has(fieldName)) {
      if (!config.excludeFields) config.excludeFields = [];
      config.excludeFields.push(fieldName);
      continue;
    }

    if (fieldConfig.exclude) {
      if (!config.excludeFields) config.excludeFields = [];
      config.excludeFields.push(fieldName);
      continue;
    }

    // Добавляем кастомные поля если есть resolver или customType
    if (fieldConfig.resolver || fieldConfig.customType) {
      if (!config.customFields) config.customFields = {};
      config.customFields[fieldName] = fieldConfig;
    }
  }

  return new AbstractGraphQLModelConfig(modelClass.name, config);
}

/**
 * Batch генерация конфигураций для массива моделей
 */
export function generateGraphQLModelConfigs(
  models: ModelCtor<Model>[],
  options: GenerateGraphQLConfigOptions = {}
): AbstractGraphQLModelConfig[] {
  return models.map(model => generateGraphQLModelConfig(model, options));
}

/**
 * Создание конфигурации модели без декораторов (программно)
 */
export function createGraphQLModelConfig(
  modelClass: ModelCtor<Model>,
  config: GraphQLModelConfig
): AbstractGraphQLModelConfig {
  return new AbstractGraphQLModelConfig(modelClass.name, config);
}
