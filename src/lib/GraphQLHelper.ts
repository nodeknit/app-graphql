import { SequelizeModel, GraphQLResolver, GraphQLType, GraphQLFieldType, GraphQLQueryHandler, GraphQLMutationHandler, GraphQLSubscriptionHandler } from "./types";
import { getGQLModelMetadata, getGQLFields, GQLFieldConfig, GQLModelConfig, AuthResult } from '../decorators/index';
import { WhereOptions } from 'sequelize';

export class GraphQLHelper {
    private models: Map<string, SequelizeModel> = new Map();
    private customResolvers: GraphQLResolver[] = [];
    private customTypes: string[] = [];
    private customQueries: GraphQLQueryHandler[] = [];
    private customMutations: GraphQLMutationHandler[] = [];
    private customSubscriptions: GraphQLSubscriptionHandler[] = [];
    private blackList: Set<string> = new Set();
    private whiteList: Set<string> = new Set();
    private modelMetadata: Map<string, { modelConfig: GQLModelConfig, fieldConfigs: Record<string, GQLFieldConfig> }> = new Map();
    private sequelize: any;

    constructor(sequelize?: any) {
        this.sequelize = sequelize;
    }

    /**
     * Add Sequelize model to GraphQL schema generation
     */
    addModel(model: any): void {
        const modelName = model.name;
        if (this.blackList.has(modelName)) {
            return;
        }

        // Получаем метаданные из декораторов
        const modelConfig = getGQLModelMetadata(model);
        const fieldConfigs = getGQLFields(model);

        // Если модель не имеет декоратора @GQLModel или исключена, пропускаем
        if (!modelConfig || modelConfig.exclude) {
            console.log(`⏭️ Skipping model ${modelName} (no @GQLModel decorator or excluded)`);
            return;
        }

        const sequelizeModel: SequelizeModel = {
            name: modelName,
            attributes: model.rawAttributes || model.attributes || {},
            associations: model.associations || {},
            tableName: model.tableName || modelName.toLowerCase(),
            primaryKeyAttribute: model.primaryKeyAttribute || 'id'
        };

        this.models.set(modelName, sequelizeModel);
        this.modelMetadata.set(modelName, { modelConfig, fieldConfigs });

        console.log(`✅ Added model ${modelName} with GraphQL decorators`);
    }

    /**
     * Add custom GraphQL resolver
     */
    addResolver(resolver: GraphQLResolver): void {
        this.customResolvers.push(resolver);
    }

    /**
     * Add custom GraphQL type definition
     */
    addType(typeDefinition: string): void {
        this.customTypes.push(typeDefinition);
    }

    /**
     * Add custom GraphQL query
     */
    addQuery(queryHandler: GraphQLQueryHandler): void {
        this.customQueries.push(queryHandler);
    }

    /**
     * Add custom GraphQL mutation
     */
    addMutation(mutationHandler: GraphQLMutationHandler): void {
        this.customMutations.push(mutationHandler);
    }

    /**
     * Add custom GraphQL subscription
     */
    addSubscription(subscriptionHandler: GraphQLSubscriptionHandler): void {
        this.customSubscriptions.push(subscriptionHandler);
    }

    /**
     * Add model or field to blacklist (exclude from schema)
     */
    addToBlackList(pattern: string): void {
        this.blackList.add(pattern);
    }

    /**
     * Add model to whitelist (include in schema)
     */
    addToWhiteList(modelName: string): void {
        this.whiteList.add(modelName);
    }

    /**
     * Generate GraphQL schema and resolvers
     */
    getSchema() {
        const typeDefs = this.generateTypeDefs();
        const resolvers = this.generateResolvers();

        return { typeDefs, resolvers };
    }

    private generateTypeDefs(): string {
        let schema = '';

        // Add JSON scalar for where conditions
        schema += 'scalar JSON\n\n';

        // Add custom types
        for (const type of this.customTypes) {
            schema += type + '\n';
        }

        // Generate types from Sequelize models
        for (const [modelName, model] of this.models) {
            if (this.whiteList.size > 0 && !this.whiteList.has(modelName)) {
                continue;
            }

            schema += this.generateModelType(model) + '\n';
        }

        // Generate input types for mutations
        for (const [modelName, model] of this.models) {
            if (this.whiteList.size > 0 && !this.whiteList.has(modelName)) {
                continue;
            }

            schema += this.generateModelInputType(model) + '\n';
        }

        // Add root types with actual operations
        schema += this.generateRootTypes();

        return schema;
    }

    private generateModelType(model: SequelizeModel): string {
        const fields = this.extractModelFields(model);
        const metadata = this.modelMetadata.get(model.name);
        const modelConfig = metadata?.modelConfig;
        const fieldConfigs = metadata?.fieldConfigs || {};

        let typeDef = '';

        // Add model description if available
        if (modelConfig?.description) {
            let description = modelConfig.description;
            
            // Автоматически добавляем информацию об авторизации
            if (modelConfig.authRequired) {
                description += ' (Requires authentication)';
            }
            
            typeDef += `"""${description}"""\n`;
        } else if (modelConfig?.authRequired) {
            // Если description нет, но требуется авторизация, добавляем базовое описание
            typeDef += `"""Requires authentication"""\n`;
        }

        typeDef += `type ${model.name} {\n`;

        for (const field of fields) {
            if (this.isFieldBlacklisted(model.name, field.name)) {
                continue;
            }

            // Add field description if available
            const fieldConfig = fieldConfigs[field.name];
            if (fieldConfig?.description) {
                typeDef += `  """${fieldConfig.description}"""\n`;
            }

            let fieldType = field.type;
            if (field.isList) {
                fieldType = `[${fieldType}]`;
            }
            if (field.isNullable) {
                fieldType += '';
            } else {
                fieldType += '!';
            }

            typeDef += `  ${field.name}: ${fieldType}\n`;
        }

        typeDef += '}\n';
        return typeDef;
    }

    private generateModelInputType(model: SequelizeModel): string {
        const fields = this.extractModelFields(model);
        const metadata = this.modelMetadata.get(model.name);
        const fieldConfigs = metadata?.fieldConfigs || {};

        let inputDef = `input ${model.name}Input {\n`;

        for (const field of fields) {
            if (this.isFieldBlacklisted(model.name, field.name) || field.isRelation) {
                continue;
            }

            // Add field description if available
            const fieldConfig = fieldConfigs[field.name];
            if (fieldConfig?.description) {
                inputDef += `  """${fieldConfig.description}"""\n`;
            }

            let fieldType = field.type;
            if (field.isList) {
                fieldType = `[${fieldType}]`;
            }
            if (field.isNullable) {
                fieldType += '';
            } else {
                fieldType += '!';
            }

            inputDef += `  ${field.name}: ${fieldType}\n`;
        }

        inputDef += '}\n';
        return inputDef;
    }

    private generateRootTypes(): string {
        let queryFields = '';
        let mutationFields = '';
        let subscriptionFields = '';

        // Generate operations for each model
        for (const [modelName, model] of this.models) {
            if (this.whiteList.size > 0 && !this.whiteList.has(modelName)) {
                continue;
            }

            const metadata = this.modelMetadata.get(modelName);
            const modelConfig = metadata?.modelConfig;
            const operations = modelConfig?.operations || { query: true, mutation: true, subscription: true };

            const queryName = modelName.charAt(0).toLowerCase() + modelName.slice(1);

            // Query operations
            if (operations.query) {
                queryFields += `  ${queryName}(id: String!): ${modelName}\n`;
                queryFields += `  ${queryName}List(where: JSON, limit: Int, offset: Int, order: String): [${modelName}]\n`;
            }

            // Mutation operations
            if (operations.mutation) {
                mutationFields += `  create${modelName}(input: ${modelName}Input!): ${modelName}\n`;
                mutationFields += `  update${modelName}(id: String!, input: ${modelName}Input!): ${modelName}\n`;
                mutationFields += `  delete${modelName}(id: String!): Boolean\n`;
            }

            // Subscription operations
            if (operations.subscription) {
                subscriptionFields += `  ${queryName}Created: ${modelName}\n`;
                subscriptionFields += `  ${queryName}Updated: ${modelName}\n`;
                subscriptionFields += `  ${queryName}Deleted(id: String!): ${modelName}\n`;
            }
        }

        // Add custom queries
        for (const query of this.customQueries) {
            if (query.description) {
                queryFields += `  """${query.description}"""\n`;
            }
            queryFields += `  ${query.name}: ${query.type}\n`;
        }

        // Add custom mutations
        for (const mutation of this.customMutations) {
            if (mutation.description) {
                mutationFields += `  """${mutation.description}"""\n`;
            }
            const inputType = mutation.inputType ? `(input: ${mutation.inputType}!)` : '';
            mutationFields += `  ${mutation.name}${inputType}: ${mutation.outputType}\n`;
        }

        // Add custom subscriptions
        for (const subscription of this.customSubscriptions) {
            if (subscription.description) {
                subscriptionFields += `  """${subscription.description}"""\n`;
            }
            subscriptionFields += `  ${subscription.name}: ${subscription.type}\n`;
        }

        return `
            type Query {
${queryFields}
            }
            type Mutation {
${mutationFields}
            }
            type Subscription {
${subscriptionFields}
            }
        `;
    }

    private extractModelFields(model: SequelizeModel): GraphQLFieldType[] {
        const fields: GraphQLFieldType[] = [];
        const metadata = this.modelMetadata.get(model.name);
        const fieldConfigs = metadata?.fieldConfigs || {};

        // Extract attributes
        for (const [attrName, attrDef] of Object.entries(model.attributes)) {
            if (this.isFieldBlacklisted(model.name, attrName)) {
                continue;
            }

            // Проверяем настройки декоратора для поля
            const fieldConfig = fieldConfigs[attrName];
            if (fieldConfig?.exclude) {
                continue; // Пропускаем поле, если exclude: true
            }

            const field = this.convertSequelizeAttributeToGraphQLField(attrName, attrDef, fieldConfig);
            if (field) {
                fields.push(field);
            }
        }

        // Extract associations
        for (const [assocName, assocDef] of Object.entries(model.associations)) {
            if (this.isFieldBlacklisted(model.name, assocName)) {
                continue;
            }

            // Проверяем настройки декоратора для ассоциации
            const fieldConfig = fieldConfigs[assocName];
            if (fieldConfig?.exclude) {
                continue; // Пропускаем ассоциацию, если exclude: true
            }

            const field = this.convertSequelizeAssociationToGraphQLField(assocName, assocDef, fieldConfig);
            if (field) {
                fields.push(field);
            }
        }

        return fields;
    }

    private convertSequelizeAttributeToGraphQLField(name: string, attr: any, fieldConfig?: GQLFieldConfig): GraphQLFieldType | null {
        const typeMap: { [key: string]: string } = {
            STRING: 'String',
            TEXT: 'String',
            INTEGER: 'Int',
            BIGINT: 'String',
            FLOAT: 'Float',
            DOUBLE: 'Float',
            DECIMAL: 'Float',
            BOOLEAN: 'Boolean',
            DATE: 'String',
            DATEONLY: 'String',
            TIME: 'String',
            JSON: 'String', // Using String for JSON, could be enhanced
            UUID: 'String'
        };

        const sequelizeType = attr.type?.key || attr.type?.constructor?.name || 'STRING';
        const graphQLType = typeMap[sequelizeType] || 'String';

        // Используем настройки из декоратора, если они есть
        const isNullable = fieldConfig?.nullable !== undefined ? fieldConfig.nullable : (attr.allowNull !== false);
        const isList = fieldConfig?.list || false;

        return {
            name,
            type: graphQLType,
            isNullable,
            isList,
            isRelation: false
        };
    }

    private convertSequelizeAssociationToGraphQLField(name: string, assoc: any, fieldConfig?: GQLFieldConfig): GraphQLFieldType | null {
        const targetModel = assoc.target?.name || assoc.targetModel?.name;
        if (!targetModel) {
            return null;
        }

        // Используем настройки из декоратора, если они есть
        const isList = fieldConfig?.list !== undefined ? fieldConfig.list : (assoc.associationType === 'HasMany' || assoc.associationType === 'BelongsToMany');
        const isNullable = fieldConfig?.nullable !== undefined ? fieldConfig.nullable : (assoc.associationType === 'BelongsTo' ? false : true);

        return {
            name,
            type: targetModel,
            isNullable,
            isList,
            isRelation: true,
            relationType: assoc.associationType,
            relatedModel: targetModel
        };
    }

    private isFieldBlacklisted(modelName: string, fieldName: string): boolean {
        return this.blackList.has(`${modelName}.${fieldName}`) ||
               this.blackList.has(fieldName) ||
               this.blackList.has(modelName);
    }

    private generateResolvers(): GraphQLResolver {
        const resolvers: GraphQLResolver = {
            Query: {},
            Mutation: {},
            Subscription: {}
        };

        // Generate CRUD resolvers for each model
        for (const [modelName, model] of this.models) {
            if (this.whiteList.size > 0 && !this.whiteList.has(modelName)) {
                continue;
            }

            const metadata = this.modelMetadata.get(modelName);
            const modelConfig = metadata?.modelConfig;
            const operations = modelConfig?.operations || { query: true, mutation: true, subscription: true };

            // Query resolvers
            if (operations.query) {
                const queryName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
                resolvers.Query![queryName] = this.generateQueryResolver(model);
                resolvers.Query![`${queryName}List`] = this.generateListQueryResolver(model);
            }

            // Mutation resolvers
            if (operations.mutation) {
                resolvers.Mutation![`create${modelName}`] = this.generateCreateMutationResolver(model);
                resolvers.Mutation![`update${modelName}`] = this.generateUpdateMutationResolver(model);
                resolvers.Mutation![`delete${modelName}`] = this.generateDeleteMutationResolver(model);
            }

            // Field resolvers for relations
            resolvers[modelName] = this.generateFieldResolvers(model);
        }

        // Merge with custom resolvers
        for (const customResolver of this.customResolvers) {
            Object.assign(resolvers.Query!, customResolver.Query || {});
            Object.assign(resolvers.Mutation!, customResolver.Mutation || {});
            Object.assign(resolvers.Subscription!, customResolver.Subscription || {});

            // Merge type resolvers
            for (const [key, value] of Object.entries(customResolver)) {
                if (key !== 'Query' && key !== 'Mutation' && key !== 'Subscription') {
                    resolvers[key] = { ...(resolvers[key] || {}), ...value };
                }
            }
        }

        // Add custom query resolvers
        for (const query of this.customQueries) {
            resolvers.Query![query.name] = query.resolver;
        }

        // Add custom mutation resolvers
        for (const mutation of this.customMutations) {
            resolvers.Mutation![mutation.name] = mutation.resolver;
        }

        // Add custom subscription resolvers
        for (const subscription of this.customSubscriptions) {
            resolvers.Subscription![subscription.name] = subscription.resolver;
        }

        return resolvers;
    }

    private generateQueryResolver(model: SequelizeModel) {
        return async (parent: any, args: any, context: any) => {
            const ModelClass = this.getModelClass(model.name);
            if (!ModelClass) return null;

            const metadata = this.modelMetadata.get(model.name);
            const modelConfig = metadata?.modelConfig;

            const { id } = args;
            let whereConditions: any = { id };

            // Проверка авторизации через authHandler
            if (modelConfig?.authRequired) {
                if (!modelConfig.authHandler) {
                    console.error(`AuthHandler method is required but not provided for model: ${model.name}`);
                    throw new Error('Access denied');
                }
                
                const authResult = await modelConfig.authHandler(context.req, whereConditions, "query");
                
                // Поддержка как старого формата (boolean), так и нового (AuthResult)
                if (typeof authResult === 'boolean') {
                    if (!authResult) {
                        throw new Error('Access denied');
                    }
                } else {
                    if (!authResult.success) {
                        throw new Error('Access denied');
                    }
                    
                    // Если authHandler вернул дополнительные where условия, мержим их
                    if (authResult.where) {
                        whereConditions = { ...whereConditions, ...authResult.where };
                    }
                }
            }

            // Используем findOne с where условиями для поддержки санитизации
            const result = await ModelClass.findOne({ where: whereConditions });
            return result ? result.toJSON() : null;
        };
    }

    private generateListQueryResolver(model: SequelizeModel) {
        return async (parent: any, args: any, context: any) => {
            const ModelClass = this.getModelClass(model.name);
            if (!ModelClass) return [];

            const metadata = this.modelMetadata.get(model.name);
            const modelConfig = metadata?.modelConfig;

            const { where, limit, offset, order } = args;
            const options: any = {};

            // Обработка where условий
            let inputWhere: WhereOptions = where;

            // Проверка авторизации через authHandler
            if (modelConfig?.authRequired) {
                if (!modelConfig.authHandler) {
                    console.error(`AuthHandler method is required but not provided for model: ${model.name}`);
                    throw new Error('Access denied');
                }
                
                const authResult = await modelConfig.authHandler(context.req, inputWhere, "query");
                
                // Поддержка как старого формата (boolean), так и нового (AuthResult)
                if (typeof authResult === 'boolean') {
                    if (!authResult) {
                        throw new Error('Access denied');
                    }
                } else {
                    if (!authResult.success) {
                        throw new Error('Access denied');
                    }
                    
                    // Если authHandler вернул дополнительные where условия, мержим их
                    if (authResult.where) {
                        inputWhere = { ...inputWhere, ...authResult.where };
                    }
                }
            }

            options.where = inputWhere;
            if (limit) options.limit = limit;
            if (offset) options.offset = offset;
            if (order) options.order = order;

            const results = await ModelClass.findAll(options);
            return results.map((result: any) => result.toJSON());
        };
    }

    private generateCreateMutationResolver(model: SequelizeModel) {
        return async (parent: any, args: any, context: any) => {
            const ModelClass = this.getModelClass(model.name);
            if (!ModelClass) return null;

            const metadata = this.modelMetadata.get(model.name);
            const modelConfig = metadata?.modelConfig;

            const { input } = args;
            let _input = null
            // Проверка авторизации через authHandler
            if (modelConfig?.authRequired) {
                if (!modelConfig.authHandler) {
                    console.error(`AuthHandler method is required but not provided for model: ${model.name}`);
                    throw new Error('Access denied');
                }
                
                const authResult = await modelConfig.authHandler(context.req, input, "create");
                
                // Поддержка как старого формата (boolean), так и нового (AuthResult)
                if (typeof authResult === 'boolean') {
                    if (!authResult) {
                        throw new Error('Access denied');
                    }
                } else {
                    if (!authResult.success) {
                        throw new Error('Access denied');
                    }
                }
            }

            return await ModelClass.create(_input);
        };
    }

    private generateUpdateMutationResolver(model: SequelizeModel) {
        return async (parent: any, args: any, context: any) => {
            const ModelClass = this.getModelClass(model.name);
            if (!ModelClass) return null;

            const metadata = this.modelMetadata.get(model.name);
            const modelConfig = metadata?.modelConfig;

            const { id, input } = args;
            let whereConditions: any = { id };

            // Проверка авторизации через authHandler
            if (modelConfig?.authRequired) {
                if (!modelConfig.authHandler) {
                    console.error(`AuthHandler method is required but not provided for model: ${model.name}`);
                    throw new Error('Access denied');
                }
                
                const authResult = await modelConfig.authHandler(context.req, whereConditions, "update");
                
                // Поддержка как старого формата (boolean), так и нового (AuthResult)
                if (typeof authResult === 'boolean') {
                    if (!authResult) {
                        throw new Error('Access denied');
                    }
                } else {
                    if (!authResult.success) {
                        throw new Error('Access denied');
                    }
                    
                    // Если authHandler вернул дополнительные where условия, мержим их
                    if (authResult.where) {
                        whereConditions = { ...whereConditions, ...authResult.where };
                    }
                }
            }

            // Используем findOne с where условиями для поддержки санитизации
            const instance = await ModelClass.findOne({ where: whereConditions });
            if (!instance) return null;

            await instance.update(input);
            return instance;
        };
    }

    private generateDeleteMutationResolver(model: SequelizeModel) {
        return async (parent: any, args: any, context: any) => {
            const ModelClass = this.getModelClass(model.name);
            if (!ModelClass) return false;

            const metadata = this.modelMetadata.get(model.name);
            const modelConfig = metadata?.modelConfig;

            const { id } = args;
            let whereConditions: any = { id };

            // Проверка авторизации через authHandler
            if (modelConfig?.authRequired) {
                if (!modelConfig.authHandler) {
                    console.error(`AuthHandler method is required but not provided for model: ${model.name}`);
                    throw new Error('Access denied');
                }
                
                const authResult = await modelConfig.authHandler(context.req, whereConditions, "delete");
                
                // Поддержка как старого формата (boolean), так и нового (AuthResult)
                if (typeof authResult === 'boolean') {
                    if (!authResult) {
                        throw new Error('Access denied');
                    }
                } else {
                    if (!authResult.success) {
                        throw new Error('Access denied');
                    }
                    
                    // Если authHandler вернул дополнительные where условия, мержим их
                    if (authResult.where) {
                        whereConditions = { ...whereConditions, ...authResult.where };
                    }
                }
            }

            // Используем findOne с where условиями для поддержки санитизации
            const instance = await ModelClass.findOne({ where: whereConditions });
            if (!instance) return false;

            await instance.destroy();
            return true;
        };
    }

    private generateFieldResolvers(model: SequelizeModel): { [key: string]: any } {
        const resolvers: { [key: string]: any } = {};

        for (const [assocName, assocDef] of Object.entries(model.associations)) {
            if (this.isFieldBlacklisted(model.name, assocName)) {
                continue;
            }

            resolvers[assocName] = async (parent: any, args: any, context: any) => {
                // This would need to be implemented based on how associations are loaded
                // For now, return the related data if it's already loaded
                return parent[assocName];
            };
        }

        return resolvers;
    }

    private getModelClass(modelName: string): any {
        // Get model from Sequelize instance
        if (this.sequelize && this.sequelize.models) {
            return this.sequelize.models[modelName];
        }

        // Fallback to models map
        const model = Array.from(this.models.values()).find(m => m.name === modelName);
        return model;
    }

}
