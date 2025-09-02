import { AbstractCollectionHandler, CollectionItem, AppManager } from "@nodeknit/app-manager";
import { getGraphQLModelMetadata } from '../decorators/index.js';

export class ModelHandler extends AbstractCollectionHandler {

    async process(appManager: AppManager, collectionItems: CollectionItem[]): Promise<void> {
        // Автоматически находим все модели Sequelize с GraphQL декораторами
        const sequelizeModels = appManager.sequelize.modelManager.models;
        
        for (const model of sequelizeModels) {
            // Проверяем, есть ли у модели GraphQL метаданные
            const metadata = getGraphQLModelMetadata(model);
            
            if (metadata && !metadata.exclude) {
                console.log(`🔍 Found GraphQL model: ${model.name}`);
                
                // Модель уже должна быть в коллекции, просто логируем
            }
        }
        
        console.log(`📊 Found ${collectionItems.length} GraphQL models in collection`);
    }

    async unprocess(appManager: AppManager, collectionItems: CollectionItem[]): Promise<void> {
        // Очистка при размонтировании
        console.log('🧹 Cleaning up GraphQL model collection');
    }
}
