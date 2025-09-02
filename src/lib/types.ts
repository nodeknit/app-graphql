export interface GraphQLResolver {
    Query?: { [key: string]: (parent: any, args: any, context: any, info: any) => any };
    Mutation?: { [key: string]: (parent: any, args: any, context: any, info: any) => any };
    Subscription?: { [key: string]: (parent: any, args: any, context: any, info: any) => any };
    [typeName: string]: { [key: string]: (parent: any, args: any, context: any, info: any) => any } | undefined;
}

export interface GraphQLType {
    name: string;
    definition: string;
}

export interface SequelizeModel {
    name: string;
    attributes: { [key: string]: any };
    associations: { [key: string]: any };
    tableName: string;
    primaryKeyAttribute: string;
}

export interface GraphQLFieldType {
    name: string;
    type: string;
    isNullable: boolean;
    isList: boolean;
    isRelation: boolean;
    relationType?: 'BelongsTo' | 'HasOne' | 'HasMany' | 'BelongsToMany';
    relatedModel?: string;
}

export interface IGraphQLModelConfig {
    modelName: string;
    model: any;
    includeInSchema?: boolean;
    customResolvers?: GraphQLResolver;
    excludeFields?: string[];
    customFields?: { [key: string]: GraphQLFieldType };
}

export interface GraphQLQueryHandler {
    name: string;
    type: string;
    resolver: (parent: any, args: any, context: any, info: any) => any;
    description?: string;
}

export interface GraphQLMutationHandler {
    name: string;
    inputType?: string;
    outputType: string;
    resolver: (parent: any, args: any, context: any, info: any) => any;
    description?: string;
}

export interface GraphQLSubscriptionHandler {
    name: string;
    type: string;
    resolver: (parent: any, args: any, context: any, info: any) => any;
    description?: string;
}
