import { Model, ModelCtor, DataType } from 'sequelize-typescript';
import { 
  GraphQLModelConfig, 
  GraphQLFieldConfig, 
  getGraphQLFields, 
  getGraphQLModelMetadata 
} from '../decorators';
import { AbstractGraphQLModelConfig } from '../abstract/AbstractGraphQLModelConfig';

// Простая функция merge вместо lodash
function mergeObjects(target: any, source: any): any {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      mergeObjects(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Маппинг типов Sequelize в GraphQL
const sequelizeToGraphQLTypes: Record<string, string> = {
  STRING: 'String',
  TEXT: 'String',
  INTEGER: 'Int',
  BIGINT: 'Int',
  FLOAT: 'Float',
  DOUBLE: 'Float',
  DECIMAL: 'Float',
  BOOLEAN: 'Boolean',
  DATE: 'String', // ISO date string
  DATEONLY: 'String',
  TIME: 'String',
  JSON: 'JSON',
  JSONB: 'JSON',
  UUID: 'String',
  ENUM: 'String'
};

interface GraphQLSchema {
  typeDefs: string;
  resolvers: any;
}

interface ResolverConfig {
  [key: string]: {
    def: string;
    fn: Function;
  };
}

export class GraphQLSchemaGenerator {
  private models: Map<string, ModelCtor<Model>> = new Map();
  private modelConfigs: Map<string, AbstractGraphQLModelConfig> = new Map();
  private customResolvers: any = {};
  private customTypes: string[] = [];
  private blackList: string[] = [];

  // Регистрация модели
  public addModel(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): void {
    const modelName = model.name;
    this.models.set(modelName, model);
    
    if (config) {
      this.modelConfigs.set(modelName, config);
    }
  }

  // Добавление пользовательских резолверов
  public addResolvers(resolvers: any): void {
    mergeObjects(this.customResolvers, resolvers);
  }

  // Добавление пользовательских типов
  public addCustomType(typeDef: string): void {
    this.customTypes.push(typeDef);
  }

  // Добавление в черный список
  public addToBlackList(items: string[]): void {
    this.blackList.push(...items);
  }

  // Генерация GraphQL схемы
  public generateSchema(): GraphQLSchema {
    let typeDefs = this.generateBaseTypeDefs();
    let resolvers = { Query: {}, Mutation: {}, Subscription: {} };

    // Генерируем типы для каждой модели
    this.models.forEach((model, modelName) => {
      if (this.isModelExcluded(modelName)) return;

      const modelConfig = this.modelConfigs.get(modelName);
      const typeDef = this.generateModelTypeDef(model, modelConfig);
      typeDefs += typeDef;

      // Генерируем резолверы для модели
      const modelResolvers = this.generateModelResolvers(model, modelConfig);
      mergeObjects(resolvers, modelResolvers);
    });

    // Добавляем пользовательские типы
    typeDefs += this.customTypes.join('\n');

    // Добавляем пользовательские резолверы
    mergeObjects(resolvers, this.customResolvers);

    return {
      typeDefs,
      resolvers
    };
  }

  private generateBaseTypeDefs(): string {
    return `
      scalar JSON
      scalar DateTime
      
      type Query {
        _health: String
      }
      
      type Mutation {
        _dummy: String
      }
      
      type Subscription {
        _dummy: String
      }
      
    `;
  }

  private generateModelTypeDef(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): string {
    const modelName = model.name;
    const typeName = config?.getTypeName() || modelName;
    const fieldsMetadata = getGraphQLFields(model);
    
    let typeDef = `type ${typeName} {\n`;

    // Получаем атрибуты модели из Sequelize
    const attributes = (model as any).rawAttributes || {};
    
    for (const [fieldName, attribute] of Object.entries(attributes)) {
      if (this.isFieldExcluded(modelName, fieldName, config)) continue;

      const fieldConfig = fieldsMetadata[fieldName] || {};
      const graphqlType = this.getGraphQLType(attribute, fieldConfig);
      
      typeDef += `  ${fieldName}: ${graphqlType}\n`;
    }

    // Добавляем ассоциации
    const associations = (model as any).associations || {};
    for (const [assocName, association] of Object.entries(associations)) {
      if (this.isFieldExcluded(modelName, assocName, config)) continue;

      const assocType = this.getAssociationType(association);
      if (assocType) {
        typeDef += `  ${assocName}: ${assocType}\n`;
      }
    }

    // Добавляем кастомные поля
    const customFields = config?.getCustomFields() || {};
    for (const [fieldName, fieldConfig] of Object.entries(customFields)) {
      const graphqlType = fieldConfig.customType || 'String';
      typeDef += `  ${fieldName}: ${graphqlType}\n`;
    }

    typeDef += '}\n\n';

    // Генерируем Input типы для мутаций
    typeDef += this.generateInputTypes(model, config);

    // Генерируем Query/Mutation/Subscription для модели
    typeDef += this.generateModelOperations(model, config);

    return typeDef;
  }

  private getGraphQLType(attribute: any, fieldConfig: GraphQLFieldConfig): string {
    // Если задан кастомный тип
    if (fieldConfig.customType) {
      return fieldConfig.customType;
    }

    // Определяем базовый тип из Sequelize
    let baseType = 'String'; // default
    
    if (attribute.type) {
      const sequelizeType = attribute.type.constructor.name || attribute.type.key;
      baseType = sequelizeToGraphQLTypes[sequelizeType] || 'String';
    }

    // Применяем модификаторы
    if (fieldConfig.list) {
      baseType = `[${baseType}]`;
    }

    if (!fieldConfig.nullable && !attribute.allowNull) {
      baseType += '!';
    }

    return baseType;
  }

  private getAssociationType(association: any): string | null {
    const targetModel = association.target?.name;
    if (!targetModel) return null;

    const associationType = association.associationType;
    
    switch (associationType) {
      case 'HasOne':
      case 'BelongsTo':
        return targetModel;
      case 'HasMany':
      case 'BelongsToMany':
        return `[${targetModel}]`;
      default:
        return null;
    }
  }

  private generateInputTypes(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): string {
    const modelName = model.name;
    const typeName = config?.getTypeName() || modelName;
    
    let inputTypeDef = `input ${typeName}Input {\n`;
    
    const attributes = (model as any).rawAttributes || {};
    for (const [fieldName, attribute] of Object.entries(attributes)) {
      if (this.isFieldExcluded(modelName, fieldName, config)) continue;
      if (fieldName === 'id') continue; // ID обычно не включается в input

      const fieldsMetadata = getGraphQLFields(model);
      const fieldConfig = fieldsMetadata[fieldName] || {};
      const graphqlType = this.getGraphQLType(attribute, fieldConfig);
      
      // Убираем обязательность для input типов
      const inputType = graphqlType.replace('!', '');
      inputTypeDef += `  ${fieldName}: ${inputType}\n`;
    }
    
    inputTypeDef += '}\n\n';
    return inputTypeDef;
  }

  private generateModelOperations(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): string {
    const modelName = model.name;
    const typeName = config?.getTypeName() || modelName;
    const operations = config?.getOperations() || { query: true, mutation: false, subscription: false };
    
    let operationsDef = '';

    if (operations.query) {
      operationsDef += `extend type Query {\n`;
      operationsDef += `  ${this.toCamelCase(modelName)}(id: String!): ${typeName}\n`;
      operationsDef += `  ${this.toCamelCase(modelName)}List(limit: Int, offset: Int, where: JSON): [${typeName}]\n`;
      operationsDef += `  ${this.toCamelCase(modelName)}Count(where: JSON): Int\n`;
      operationsDef += `}\n\n`;
    }

    if (operations.mutation) {
      operationsDef += `extend type Mutation {\n`;
      operationsDef += `  create${typeName}(input: ${typeName}Input!): ${typeName}\n`;
      operationsDef += `  update${typeName}(id: String!, input: ${typeName}Input!): ${typeName}\n`;
      operationsDef += `  delete${typeName}(id: String!): Boolean\n`;
      operationsDef += `}\n\n`;
    }

    if (operations.subscription) {
      operationsDef += `extend type Subscription {\n`;
      operationsDef += `  ${this.toCamelCase(modelName)}Updated(id: String): ${typeName}\n`;
      operationsDef += `}\n\n`;
    }

    return operationsDef;
  }

  private generateModelResolvers(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): any {
    const modelName = model.name;
    const typeName = config?.getTypeName() || modelName;
    const operations = config?.getOperations() || { query: true, mutation: false, subscription: false };
    
    const resolvers: any = {};

    // Резолверы для полей модели (включая ассоциации)
    resolvers[typeName] = this.generateFieldResolvers(model, config);

    if (operations.query) {
      if (!resolvers.Query) resolvers.Query = {};
      
      resolvers.Query[this.toCamelCase(modelName)] = async (parent: any, args: any, context: any) => {
        return await model.findByPk(args.id);
      };

      resolvers.Query[`${this.toCamelCase(modelName)}List`] = async (parent: any, args: any, context: any) => {
        const options: any = {};
        if (args.limit) options.limit = args.limit;
        if (args.offset) options.offset = args.offset;
        if (args.where) options.where = args.where;
        
        return await model.findAll(options);
      };

      resolvers.Query[`${this.toCamelCase(modelName)}Count`] = async (parent: any, args: any, context: any) => {
        const options: any = {};
        if (args.where) options.where = args.where;
        
        return await model.count(options);
      };
    }

    if (operations.mutation) {
      if (!resolvers.Mutation) resolvers.Mutation = {};
      
      resolvers.Mutation[`create${typeName}`] = async (parent: any, args: any, context: any) => {
        return await model.create(args.input);
      };

      resolvers.Mutation[`update${typeName}`] = async (parent: any, args: any, context: any) => {
        const instance = await model.findByPk(args.id);
        if (!instance) throw new Error(`${typeName} not found`);
        
        return await instance.update(args.input);
      };

      resolvers.Mutation[`delete${typeName}`] = async (parent: any, args: any, context: any) => {
        const instance = await model.findByPk(args.id);
        if (!instance) throw new Error(`${typeName} not found`);
        
        await instance.destroy();
        return true;
      };
    }

    return resolvers;
  }

  private generateFieldResolvers(model: ModelCtor<Model>, config?: AbstractGraphQLModelConfig): any {
    const resolvers: any = {};
    
    // Резолверы для ассоциаций
    const associations = (model as any).associations || {};
    for (const [assocName, association] of Object.entries(associations)) {
      if (this.isFieldExcluded(model.name, assocName, config)) continue;

      resolvers[assocName] = async (parent: any) => {
        if (!parent[assocName]) {
          // Загружаем ассоциацию динамически
          const instance = await model.findByPk(parent.id, {
            include: [{ association: assocName }]
          });
          return (instance as any)?.[assocName];
        }
        return parent[assocName];
      };
    }

    // Резолверы для кастомных полей
    const customFields = config?.getCustomFields() || {};
    for (const [fieldName, fieldConfig] of Object.entries(customFields)) {
      if (fieldConfig.resolver) {
        resolvers[fieldName] = fieldConfig.resolver;
      }
    }

    return resolvers;
  }

  private isModelExcluded(modelName: string): boolean {
    const config = this.modelConfigs.get(modelName);
    return config?.isExcluded() || this.blackList.includes(modelName);
  }

  private isFieldExcluded(modelName: string, fieldName: string, config?: AbstractGraphQLModelConfig): boolean {
    const excludeFields = config?.getExcludeFields() || ['createdAt', 'updatedAt'];
    return excludeFields.includes(fieldName) || 
           this.blackList.includes(`${modelName}.${fieldName}`) ||
           this.blackList.includes(fieldName);
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
}
