import 'isomorphic-unfetch';
import http from 'http';
import ws from 'ws';
import gql from 'graphql-tag';
import express from 'express';
import { ApolloServer, AuthenticationError, PubSub } from 'apollo-server-express';
import localStorage from '../localStorage';
import { initApollo } from '..';

const pubsub = new PubSub();

const resolve = jest.fn(() => 1);
const context = jest.fn(() => ({}));

const typeDefs = gql`
  type Query { viewer: Int }
  type Subscription { viewer: Int }
`;

const resolvers = {
  Query: {
    viewer: () => resolve(),
  },
  Subscription: {
    viewer: {
      subscribe: () => {
        pubsub.publish('NEW_SUBSCRIPTION');
        return pubsub.asyncIterator(['NEW_VIEWER']);
      },
    },
  },
};

const apolloServer = new ApolloServer({
  typeDefs, resolvers, context,
});
// throw new AuthenticationError();

const app = express();
apolloServer.applyMiddleware({ app });

const server = http.createServer(app);
apolloServer.installSubscriptionHandlers(server);
server.listen();

const { port } = server.address();

describe('initApollo', () => {
  describe('http', () => {
    beforeEach(() => { process.browser = false; });

    const request = (httpLink, options) => {
      const client = initApollo({}, { uri: `http://localhost:${port}/graphql`, http: httpLink, ...options });
      return client.query({ query: gql`query { viewer }`, fetchPolicy: 'network-only' });
    };

    it('successfully get data', async () => {
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(localStorage.getItem).toHaveBeenCalledWith('nextjs-apollo-token');
      expect(localStorage.getItem).toHaveBeenCalledTimes(1);
      expect(localStorage.setItem).toHaveBeenCalledTimes(0);
      expect(context).toHaveBeenCalledWith(expect.objectContaining({
        req: expect.objectContaining({
          headers: expect.objectContaining({ authorization: '' }),
        }),
      }));
    });

    it('successfully get data with token', async () => {
      localStorage.getItem.mockReturnValueOnce('TOKEN_FROM_STORAGE');
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(localStorage.getItem).toHaveBeenCalledWith('nextjs-apollo-token');
      expect(localStorage.getItem).toHaveBeenCalledTimes(1);
      expect(localStorage.setItem).toHaveBeenCalledTimes(0);
      expect(context).toHaveBeenCalledWith(expect.objectContaining({
        req: expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer TOKEN_FROM_STORAGE' }),
        }),
      }));
    });

    it('when renew token', async () => {
      localStorage.getItem.mockReturnValueOnce('TOKEN_FROM_STORAGE');
      context.mockImplementationOnce(({ res }) => {
        res.append('authorization', 'NEW_TOKEN');
      });
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(localStorage.setItem).toHaveBeenCalledWith('nextjs-apollo-token', 'NEW_TOKEN');
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('when AuthenticationError', async () => {
      context.mockImplementationOnce(() => { throw new AuthenticationError(); });
      const onSignOut = jest.fn();
      await expect(request(null, { onSignOut })).rejects.toEqual(
        new Error('Network error: Response not successful: Received status code 400'),
      );
      expect(context).toHaveBeenCalledTimes(1);
      expect(localStorage.setItem).toHaveBeenCalledWith('nextjs-apollo-token', '');
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('when ServerError', async () => {
      context.mockImplementationOnce(() => { throw new Error(); });
      const onSignOut = jest.fn();
      const onError = jest.fn();
      const { data } = await request(null, { onSignOut, onError });
      expect(data).toEqual({ viewer: 1 });
      expect(context).toHaveBeenCalledTimes(2);
      expect(onSignOut).toHaveBeenCalledTimes(0);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('ws', () => {
    beforeEach(() => { process.browser = true; });

    const request = async (wsLink, options) => {
      delete initApollo.client;
      const client = initApollo({}, {
        uri: `http://localhost:${port}/graphql`,
        ws: { webSocketImpl: ws, ...wsLink },
        ...options,
      });

      let subscription;
      const result = await new Promise(async (subResolve, subReject) => {
        subscription = await pubsub.asyncIterator(['NEW_SUBSCRIPTION']);
        client
          .subscribe({ query: gql`subscription { viewer }` })
          .subscribe({ next: subResolve, error: subReject });
        await subscription.next();
        pubsub.publish('NEW_VIEWER', { viewer: 1 });
      });
      await subscription.return();
      return result;
    };

    it('successfully get data', async () => {
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(localStorage.getItem).toHaveBeenCalledWith('apollo-cache-persist');
      expect(localStorage.getItem).toHaveBeenCalledWith('nextjs-apollo-token');
      expect(localStorage.getItem).toHaveBeenCalledTimes(2);
      expect(localStorage.setItem).toHaveBeenCalledTimes(0);
      expect(context).toHaveBeenCalledWith(expect.objectContaining({
        connection: expect.objectContaining({
          context: expect.objectContaining({ authorization: '' }),
        }),
      }));
      expect(context).toHaveBeenCalledTimes(1);
    });

    it('successfully get data with token', async () => {
      localStorage.getItem.mockReturnValueOnce(null);
      localStorage.getItem.mockReturnValueOnce('TOKEN_FROM_STORAGE');
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(localStorage.getItem).toHaveBeenCalledWith('apollo-cache-persist');
      expect(localStorage.getItem).toHaveBeenCalledWith('nextjs-apollo-token');
      expect(localStorage.getItem).toHaveBeenCalledTimes(2);
      expect(localStorage.setItem).toHaveBeenCalledTimes(0);
      expect(context).toHaveBeenCalledWith(expect.objectContaining({
        connection: expect.objectContaining({
          context: expect.objectContaining({ authorization: 'Bearer TOKEN_FROM_STORAGE' }),
        }),
      }));
      expect(context).toHaveBeenCalledTimes(1);
    });

    it('successfully get client from memory', async () => {
      const client = initApollo({}, {
        uri: `http://localhost:${port}/graphql`,
        ws: { webSocketImpl: ws },
      });
      expect(client).toBe(initApollo({}, {
        uri: `http://localhost:${port}/graphql`,
        ws: { webSocketImpl: ws },
      }));
      await new Promise(res => setTimeout(res, 500));
      expect(context).toHaveBeenCalledTimes(0);
    });
  });
});
