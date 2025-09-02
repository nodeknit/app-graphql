import { AbstractCollectionHandler, CollectionItem } from "@nodeknit/app-manager";
import { getGQLModelMetadata, getGQLFields } from '../decorators/index.js';

export class GQLModelHandler extends AbstractCollectionHandler {
    private graphqlApp: any;

    constructor(graphqlApp: any) {
        super();
        this.graphqlApp = graphqlApp;
    }

    async process(appManager: any, collectionItems: CollectionItem[]): Promise<void> {
        console.log(`🔍 Processing ${collectionItems.length} GQL models from collections...`);

        for (const collectionItem of collectionItems) {
            const model = collectionItem.item;

            if (!model || !model.prototype) {
                console.warn(`⚠️  Invalid model in collection: ${collectionItem.appId}`);
                continue;
            }

            // Получаем метаданные модели из декораторов
            const modelMetadata = getGQLModelMetadata(model);
            const fieldsMetadata = getGQLFields(model);

            if (modelMetadata && !modelMetadata.exclude) {
                console.log(`   ✅ Registering GQL model: ${model.name} from app: ${collectionItem.appId}`);

                // Добавляем модель напрямую через GraphQL приложение
                if (this.graphqlApp && typeof this.graphqlApp.addModel === 'function') {
                    this.graphqlApp.addModel(model);
                    console.log(`   📡 Model added to GraphQL schema`);
                } else {
                    console.warn(`   ⚠️  GraphQL app not available or addModel method not found`);
                }
            } else {
                console.log(`   ⏭️  Skipping model ${model.name} (no GQL metadata or excluded)`);
            }
        }
    }

    async unprocess(appManager: any, collectionItems: CollectionItem[]): Promise<void> {
        console.log('🧹 Cleaning up GQL model collection');

        for (const collectionItem of collectionItems) {
            const model = collectionItem.item;
            console.log(`   🗑️  Removing GQL model: ${model.name}`);

            // Удаляем модель напрямую через GraphQL приложение
            if (this.graphqlApp && typeof this.graphqlApp.removeModel === 'function') {
                this.graphqlApp.removeModel(model.name);
            }
        }
    }
}
