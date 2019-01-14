import 'isomorphic-unfetch';
import _ from 'lodash';
import http from 'http';
import ws from 'ws';
import { graphql } from 'react-apollo';
import gql from 'graphql-tag';
import express from 'express';
import PropTypes from 'prop-types';
import { ApolloServer, PubSub } from 'apollo-server-express';
import { withApollo, initApollo, JsonWebToken } from '..';

const pubsub = new PubSub();

const toValues = jest.fn(_.identity);
const toModel = jest.fn(_.identity);
const fetchCorrelation = jest.fn(values => Promise.resolve(values));
const createCorrelation = jest.fn(values => Promise.resolve(values));
const updateCorrelation = jest.fn(values => Promise.resolve(values));
const resolve = jest.fn(() => 1);

const jwt = new JsonWebToken({
  JWT_SECRET: 'XYZ',
}, {
  toValues,
  toModel,
  createCorrelation,
  updateCorrelation,
  fetchCorrelation,
});

const typeDefs = gql`
  type Query { viewer: Int }
  type Subscription { viewer: Int }
`;

const resolvers = {
  Query: {
    viewer: (payload, args, context) => resolve(context),
  },
  Subscription: {
    viewer: {
      subscribe: (payload, args, context) => {
        pubsub.publish('NEW_SUBSCRIPTION', context);
        return pubsub.asyncIterator(['NEW_VIEWER']);
      },
    },
  },
};

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: jwt.contextParser(),
});

const app = express();
apolloServer.applyMiddleware({ app });

const server = http.createServer(app);
apolloServer.installSubscriptionHandlers(server);
server.listen();

const { port } = server.address();

describe('withApollo', () => {
});
