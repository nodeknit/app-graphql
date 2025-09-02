import { GraphQLQueryHandler, GraphQLMutationHandler, GraphQLSubscriptionHandler } from '../lib/types';

// Example custom query handler
export const customHelloQuery: GraphQLQueryHandler = {
    name: 'hello',
    type: 'String',
    description: 'Returns a greeting message',
    resolver: async (parent, args, context, info) => {
        return 'Hello from custom GraphQL query!';
    }
};

// Example custom mutation handler
export const customCreateGreetingMutation: GraphQLMutationHandler = {
    name: 'createGreeting',
    inputType: 'GreetingInput',
    outputType: 'String',
    description: 'Creates a custom greeting',
    resolver: async (parent, args, context, info) => {
        const { name } = args.input;
        return `Hello, ${name}! This is a custom mutation.`;
    }
};

// Example custom subscription handler
export const customTimeSubscription: GraphQLSubscriptionHandler = {
    name: 'currentTime',
    type: 'String',
    description: 'Returns current time every second',
    resolver: async (parent, args, context, info) => {
        // For subscriptions, we typically return an AsyncIterator
        // This is a simplified example
        return new Date().toISOString();
    }
};

// Custom type definition for the mutation input
export const greetingInputType = `
input GreetingInput {
    name: String!
}
`;
