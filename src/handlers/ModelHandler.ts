import { Collection, CollectionHandler, CollectionItem, AppManager } from "@nodeknit/app-manager";
import { getGraphQLModelMetadata } from '../decorators/index.js';

@Collection('graphql-models')
export class ModelHandler implements CollectionHandler {

    async process(appManager: AppManager, collectionItems: CollectionItem[]): Promise<void> {
        // Автоматически находим все модели Sequelize с GraphQL декораторами
        const sequelizeModels = appManager.sequelize.modelManager.models;
        
        for (const model of sequelizeModels) {
            // Проверяем, есть ли у модели GraphQL метаданные
            const metadata = getGraphQLModelMetadata(model);
            
            if (metadata && !metadata.exclude) {
                console.log(`🔍 Found GraphQL model: ${model.name}`);
                
                // Добавляем модель в коллекцию для обработки
                collectionItems.push({
                    appId: 'app-graphql',
                    item: model,
                    itemId: model.name,
                    metadata: metadata
                });
            }
        }
        
        console.log(`📊 Discovered ${collectionItems.length} GraphQL models from Sequelize`);
    }

    async unprocess(appManager: AppManager, collectionItems: CollectionItem[]): Promise<void> {
        // Очистка при размонтировании
        console.log('🧹 Cleaning up GraphQL model collection');
    }
}
