import { AbstractApp, AppManager, Collection, CollectionHandler } from "@nodeknit/app-manager";
import { GraphQLHelper } from './lib/GraphQLHelper';
import type { IGraphQLModelConfig, GraphQLQueryHandler, GraphQLMutationHandler, GraphQLSubscriptionHandler } from './lib/types';
import { GQLModelHandler } from './handlers/GQLModelHandler.js';
import { ApolloServer } from '@apollo/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface GraphQLAppConfig {
    endpoint?: string;
    playground?: boolean;
    introspection?: boolean;
    enableMutations?: boolean;
}

export class AppGraphQL extends AbstractApp {
    appId: string = "app-graphql";
    name: string = "GraphQL Schema Generator";

    private graphqlHelper: GraphQLHelper;
    private config: GraphQLAppConfig;
    private apolloServer: ApolloServer | null = null;

    models: any[] = [];

    customResolvers: any[] = [];

    customTypes: string[] = [];

    @Collection
    customQueries: GraphQLQueryHandler[] = [];

    @Collection
    customMutations: GraphQLMutationHandler[] = [];

    @Collection
    customSubscriptions: GraphQLSubscriptionHandler[] = [];

    whiteListedModels: string[] = [];


    blackListedFields: string[] = [];

    // Handler для обработки GQL моделей из других приложений
    @CollectionHandler('gqlModels')
    gqlModelHandler: GQLModelHandler = new GQLModelHandler(this);

    constructor(appManager: AppManager, config: GraphQLAppConfig = {}) {
        super(appManager);
        this.graphqlHelper = new GraphQLHelper(appManager.sequelize);
        this.config = {
            endpoint: '/graphql',
            playground: true,
            introspection: true,
            enableMutations: false,
            ...config
        };

        // Инициализируем handler с ссылкой на себя
        this.gqlModelHandler = new GQLModelHandler(this);
    }

    async mount(): Promise<void> {
        console.log('🚀 GraphQL App mounting...');

        // Process own collections
        this.processModels();
        this.processCustomResolvers();
        this.processCustomTypes();
        this.processCustomQueries();
        this.processCustomMutations();
        this.processCustomSubscriptions();
        this.processWhiteList();
        this.processBlackList();

        // Process collections from ALL apps
        await this.processAllAppCollections();

        // Generate schema
        const schemaData = this.graphqlHelper.getSchema();

        // Create Apollo Server
        this.apolloServer = new ApolloServer({
            typeDefs: schemaData.typeDefs,
            resolvers: schemaData.resolvers as any,
            introspection: this.config.introspection,
        });

        // Start Apollo Server
        await this.apolloServer.start();

        // Добавляем GET обработчик для GraphQL Playground
        this.appManager.app.get(this.config.endpoint!, async (req: any, res: any) => {
            try {
                const playgroundPath = join(process.cwd(), 'local_modules', 'app-graphql', 'src', 'playground.html');
                const playgroundHtml = readFileSync(playgroundPath, 'utf8');
                
                res.setHeader('Content-Type', 'text/html');
                res.send(playgroundHtml);
            } catch (error) {
                res.status(500).send('Error loading GraphQL Playground');
            }
        });

        // Добавляем POST обработчик для GraphQL запросов
        this.appManager.app.post(this.config.endpoint!, async (req: any, res: any) => {
            try {
                const { query, variables, operationName } = req.body;
                
                if (!query) {
                    return res.status(400).json({ error: 'Query is required' });
                }

                // Создаем контекст с информацией о пользователе
                const context = {
                    user: req.user || null,
                    req,
                    res
                };

                const response = await this.apolloServer!.executeOperation({
                    query,
                    variables: variables || {},
                    operationName: operationName || undefined,
                }, {
                    contextValue: context
                });

                // Обработка ответа от Apollo Server
                if (response.body.kind === 'single') {
                    const result = response.body.singleResult;
                    
                    // Возвращаем результат в формате, ожидаемом GraphQL Playground
                    const graphqlResponse: any = {};
                    
                    if (result.data !== undefined) {
                        graphqlResponse.data = result.data;
                    }
                    
                    if (result.errors && result.errors.length > 0) {
                        graphqlResponse.errors = result.errors;
                    }
                    
                    return res.json(graphqlResponse);
                } else {
                    // Для других типов ответов
                    return res.json(response.body);
                }
                
            } catch (error) {
                console.error('GraphQL execution error:', error);
                res.status(500).json({ 
                    error: 'Internal server error',
                    details: (error as Error).message 
                });
            }
        });        console.log(`✅ GraphQL endpoints available:`);
        console.log(`   📊 Apollo GraphQL: ${this.config.endpoint}`);
        console.log(`   🎮 Local GraphQL Playground: http://localhost:${process.env.PORT || 17280}${this.config.endpoint}`);
        console.log(`   📋 Schema: ${this.config.endpoint}/schema`);
        console.log(`   🔍 Introspection: ${this.config.introspection ? 'enabled' : 'disabled'}`);

        // Add GraphQL info endpoint
        this.appManager.app.get('/graphql/info', (req: any, res: any) => {
            res.json({
                message: 'Apollo GraphQL Server Info',
                version: '@apollo/server v5.0.0',
                endpoint: this.config.endpoint,
                playgroundUrl: `http://localhost:${process.env.PORT || 17280}${this.config.endpoint}`,
                schemaTypes: Array.from(this.graphqlHelper['models'].keys()),
                introspection: this.config.introspection,
                environment: process.env.NODE_ENV || 'development'
            });
        });
    }

    async unmount(): Promise<void> {
        console.log('GraphQL App unmounting...');

        if (this.apolloServer) {
            await this.apolloServer.stop();
            console.log('Apollo Server stopped');
        }
    }

    private processModels(): void {
        console.log(`📋 Processing ${this.models.length} models for GraphQL schema...`);

        for (const model of this.models) {
            try {
                this.graphqlHelper.addModel(model);
                console.log(`   ✅ Added model: ${model.name}`);
            } catch (error) {
                console.error(`   ❌ Error adding model ${model.name}:`, error);
            }
        }
    }

    private processCustomResolvers(): void {
        if (this.customResolvers.length > 0) {
            console.log(`🔧 Processing ${this.customResolvers.length} custom resolvers...`);

            for (const resolver of this.customResolvers) {
                try {
                    this.graphqlHelper.addResolver(resolver);
                    console.log(`   ✅ Added custom resolver`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom resolver:`, error);
                }
            }
        }
    }

    private processCustomTypes(): void {
        if (this.customTypes.length > 0) {
            console.log(`📝 Processing ${this.customTypes.length} custom types...`);

            for (const type of this.customTypes) {
                try {
                    this.graphqlHelper.addType(type);
                    console.log(`   ✅ Added custom type`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom type:`, error);
                }
            }
        }
    }

    private processCustomQueries(): void {
        if (this.customQueries.length > 0) {
            console.log(`🔍 Processing ${this.customQueries.length} custom queries...`);

            for (const query of this.customQueries) {
                try {
                    this.graphqlHelper.addQuery(query);
                    console.log(`   ✅ Added custom query: ${query.name || 'unnamed'}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom query:`, error);
                }
            }
        }
    }

    private processCustomMutations(): void {
        if (this.customMutations.length > 0) {
            console.log(`✏️ Processing ${this.customMutations.length} custom mutations...`);

            for (const mutation of this.customMutations) {
                try {
                    this.graphqlHelper.addMutation(mutation);
                    console.log(`   ✅ Added custom mutation: ${mutation.name || 'unnamed'}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom mutation:`, error);
                }
            }
        }
    }

    private processCustomSubscriptions(): void {
        if (this.customSubscriptions.length > 0) {
            console.log(`📡 Processing ${this.customSubscriptions.length} custom subscriptions...`);

            for (const subscription of this.customSubscriptions) {
                try {
                    this.graphqlHelper.addSubscription(subscription);
                    console.log(`   ✅ Added custom subscription: ${subscription.name || 'unnamed'}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom subscription:`, error);
                }
            }
        }
    }

    private processWhiteList(): void {
        if (this.whiteListedModels.length > 0) {
            console.log(`✅ Processing whitelist for ${this.whiteListedModels.length} models...`);

            for (const modelName of this.whiteListedModels) {
                this.graphqlHelper.addToWhiteList(modelName);
                console.log(`   ✅ Whitelisted model: ${modelName}`);
            }
        }
    }

    private processBlackList(): void {
        if (this.blackListedFields.length > 0) {
            console.log(`❌ Processing blacklist for ${this.blackListedFields.length} items...`);

            for (const field of this.blackListedFields) {
                this.graphqlHelper.addToBlackList(field);
                console.log(`   ❌ Blacklisted: ${field}`);
            }
        }
    }

    private async processAllAppCollections(): Promise<void> {
        console.log('🔍 Processing collections from all apps...');

        // Get collections from AppManager
        const collectionStorage = (this.appManager as any).collectionStorage;
        if (!collectionStorage) {
            console.log('⚠️ CollectionStorage not found in AppManager');
            return;
        }

        // Process customQueries from all apps
        const customQueries = collectionStorage.collections.get('customQueries') || [];
        if (customQueries.length > 0) {
            console.log(`� Processing ${customQueries.length} custom queries from all apps...`);
            for (const queryItem of customQueries) {
                try {
                    this.graphqlHelper.addQuery(queryItem.item);
                    console.log(`   ✅ Added custom query: ${queryItem.item.name || 'unnamed'} from app: ${queryItem.appId}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom query from app ${queryItem.appId}:`, error);
                }
            }
        }

        // Process customMutations from all apps
        const customMutations = collectionStorage.collections.get('customMutations') || [];
        if (customMutations.length > 0) {
            console.log(`✏️ Processing ${customMutations.length} custom mutations from all apps...`);
            for (const mutationItem of customMutations) {
                try {
                    this.graphqlHelper.addMutation(mutationItem.item);
                    console.log(`   ✅ Added custom mutation: ${mutationItem.item.name || 'unnamed'} from app: ${mutationItem.appId}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom mutation from app ${mutationItem.appId}:`, error);
                }
            }
        }

        // Process customSubscriptions from all apps
        const customSubscriptions = collectionStorage.collections.get('customSubscriptions') || [];
        if (customSubscriptions.length > 0) {
            console.log(`📡 Processing ${customSubscriptions.length} custom subscriptions from all apps...`);
            for (const subscriptionItem of customSubscriptions) {
                try {
                    this.graphqlHelper.addSubscription(subscriptionItem.item);
                    console.log(`   ✅ Added custom subscription: ${subscriptionItem.item.name || 'unnamed'} from app: ${subscriptionItem.appId}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom subscription from app ${subscriptionItem.appId}:`, error);
                }
            }
        }

        // Process customTypes from all apps
        const customTypes = collectionStorage.collections.get('customTypes') || [];
        if (customTypes.length > 0) {
            console.log(`� Processing ${customTypes.length} custom types from all apps...`);
            for (const typeItem of customTypes) {
                try {
                    this.graphqlHelper.addType(typeItem.item);
                    console.log(`   ✅ Added custom type from app: ${typeItem.appId}`);
                } catch (error) {
                    console.error(`   ❌ Error adding custom type from app ${typeItem.appId}:`, error);
                }
            }
        }
    }

    // Public methods for manual registration
    public addModel(model: any): void {
        this.models.push(model);
        this.graphqlHelper.addModel(model);
    }

    public addResolver(resolver: any): void {
        this.customResolvers.push(resolver);
        this.graphqlHelper.addResolver(resolver);
    }

    public addType(type: string): void {
        this.customTypes.push(type);
        this.graphqlHelper.addType(type);
    }

    public getSchema() {
        return this.graphqlHelper.getSchema();
    }

    public getGraphQLHelper(): GraphQLHelper {
        return this.graphqlHelper;
    }
}
