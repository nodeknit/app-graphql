import { GraphQLModelConfig } from '../decorators';

export class AbstractGraphQLModelConfig {
  public modelName: string;
  public config: GraphQLModelConfig;

  constructor(modelName: string, config: GraphQLModelConfig) {
    this.modelName = modelName;
    this.config = config;
  }

  // Методы для работы с конфигурацией
  public getTypeName(): string {
    return this.config.typeName || this.modelName;
  }

  public isExcluded(): boolean {
    return this.config.exclude || false;
  }

  public getOperations() {
    return this.config.operations || {
      query: true,
      mutation: false,
      subscription: false
    };
  }

  public getCustomFields() {
    return this.config.customFields || {};
  }

  public getExcludeFields(): string[] {
    return this.config.excludeFields || ['createdAt', 'updatedAt'];
  }
}
