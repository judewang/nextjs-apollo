import 'isomorphic-unfetch';
import _ from 'lodash';
import http from 'http';
import ws from 'ws';
import gql from 'graphql-tag';
import express from 'express';
import { ApolloServer, PubSub } from 'apollo-server-express';
import { ApolloClient } from 'apollo-client';
import { ApolloLink } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { onError } from 'apollo-link-error';
import { WebSocketLink } from 'apollo-link-ws';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { getMainDefinition } from 'apollo-utilities';
import JsonWebToken from '../JsonWebToken';
import generateSecret from '../generateSecret';

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

const req = { token: '', correlationId: '' };
const res = {};

const httpLink = new HttpLink({
  uri: `http://localhost:${port}/graphql`,
  fetch,
});

const authLink = new ApolloLink((operation, forward) => {
  operation.setContext(() => ({
    headers: {
      authorization: req.token && `Bearer ${req.token}`,
      Cookie: `x-correlation-id=${req.correlationId}`,
    },
  }));
  return forward(operation).map((data) => {
    const { response: { headers } } = operation.getContext();
    res.headers = headers;
    return data;
  });
});

const errorLink = onError(({ operation }) => {
  const { response: { headers } } = operation.getContext();
  res.headers = headers;
});

const wsLink = new WebSocketLink({
  uri: `ws://localhost:${port}/graphql`,
  options: {
    connectionParams: () => ({
      authorization: req.token && `Bearer ${req.token}`,
    }),
  },
  webSocketImpl: ws,
});

const link = ApolloLink.split(({ query }) => {
  const { kind, operation } = getMainDefinition(query);
  return kind === 'OperationDefinition' && operation === 'subscription';
}, wsLink, ApolloLink.from([errorLink, authLink, httpLink]));

const client = new ApolloClient({ link, cache: new InMemoryCache() });

describe('contextParser', () => {
  describe('http', () => {
    const request = (token = '', correlationId = 10) => {
      req.token = token;
      req.correlationId = correlationId;
      return client.query({ query: gql`query { viewer }`, fetchPolicy: 'network-only' });
    };

    const expectToReject = async (query, contentEextend) => {
      await expect(query.catch((error) => {
        const { errors } = error.networkError.result;
        expect(errors[0].message).toBe('Context creation failed: must authenticate');
        throw error;
      })).rejects.toEqual(
        new Error('Network error: Response not successful: Received status code 400'),
      );
      expect(res.headers.get('x-content-extend')).toBe(contentEextend);
      expect(res.headers.get('set-cookie')).toBeNull();
    };

    it('successfully get guest', async () => {
      const { data } = await request();
      expect(data).toEqual({ viewer: 1 });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('authorization')).toBeNull();
      expect(resolve).not.toHaveBeenCalledWith(expect.objectContaining({
        auth: expect.objectContaining({ user: expect.anything() }),
      }));
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    describe('verify token', () => {
      it('successfully get user', async () => {
        const token = jwt.signWithCorrelation({ id: '10' }, { id: '1' });
        const { data } = await request(token);

        expect(data).toEqual({ viewer: 1 });
        expect(toModel).toHaveBeenCalledWith({ id: '1' });
        expect(toModel).toHaveBeenCalledTimes(1);
        expect(toValues).toHaveBeenCalledTimes(1);
        expect(createCorrelation).toHaveBeenCalledTimes(0);
        expect(updateCorrelation).toHaveBeenCalledTimes(0);
        expect(fetchCorrelation).toHaveBeenCalledTimes(0);

        expect(res.headers.get('set-cookie')).toBeNull();
        expect(res.headers.get('authorization')).toBeNull();
        expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
          auth: expect.objectContaining({ user: { id: '1' } }),
        }));
      });

      it('when x-correlation-id is invalid', async () => {
        const token = jwt.signWithCorrelation({ id: '9' }, { id: '1' });
        await expectToReject(request(token), 'not match to correlation id');
      });

      it('when token expired', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: -1 });
        await expectToReject(request(token), 'jwt expired');
      });

      it('when token is invalid', async () => {
        await expectToReject(request('XXYYZZ'), 'jwt malformed');
      });
    });

    describe('renew token', () => {
      it('successfully renew token', async () => {
        const token = jwt.sign({
          correlation: { id: '10', secret: 'OpenDoor' },
          user: { id: '1' },
        }, {
          expiresIn: 14 * (24 - 2) * 60 * 60,
        });

        generateSecret.mockReturnValueOnce('SECRET');
        fetchCorrelation.mockReturnValueOnce({ id: '10', secret: 'OpenDoor' });
        const { data } = await request(token);

        expect(data).toEqual({ viewer: 1 });
        expect(toModel).toHaveBeenCalledWith({ id: '1' });
        expect(toModel).toHaveBeenCalledTimes(1);
        expect(toValues).toHaveBeenCalledTimes(1);
        expect(fetchCorrelation).toHaveBeenCalledWith(
          '10', expect.objectContaining({ user: { id: '1' } }), expect.objectContaining({}),
        );
        expect(updateCorrelation).toHaveBeenCalledWith(
          '10', 'SECRET', expect.objectContaining({ user: { id: '1' } }), expect.objectContaining({}),
        );
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(jwt.verify(res.headers.get('authorization'))).toEqual(expect.objectContaining({
          correlation: { id: '10', secret: 'SECRET' }, user: { id: '1' },
        }));
        expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
          auth: expect.objectContaining({ user: { id: '1' } }),
        }));
      });

      it('when not match to secret', async () => {
        const token = jwt.signWithCorrelation(
          { id: '10', secret: 'OpenDoor' },
          { id: '1' },
          { expiresIn: 14 * (24 - 2) * 60 * 60 },
        );
        fetchCorrelation.mockReturnValueOnce({ id: '10', secret: 'CloseDoor' });
        await expectToReject(request(token), 'not match to secret');

        expect(toModel).toHaveBeenCalledWith({ id: '1' });
        expect(toModel).toHaveBeenCalledTimes(1);
        expect(toValues).toHaveBeenCalledTimes(1);
        expect(fetchCorrelation).toHaveBeenCalledWith(
          '10', expect.objectContaining({ user: { id: '1' } }), expect.objectContaining({}),
        );
        expect(fetchCorrelation).toHaveBeenCalledTimes(1);
        expect(updateCorrelation).toHaveBeenCalledTimes(0);
      });
    });

    describe('signIn', () => {
      beforeEach(() => {
        resolve.mockImplementation(async ({ auth }) => {
          expect(auth.user).toBeNull();
          await auth.signIn({ id: '1' });
          expect(auth.user).not.toBeNull();
          return 9;
        });
      });

      describe('isUnfamiliarCorrelation is true', () => {
        it('when x-correlation-id is not exist', async () => {
          createCorrelation.mockImplementation(() => ({ id: '10', isUnfamiliarCorrelation: true }));
          const { data } = await request('', '');
          expect(data).toEqual({ viewer: 9 });
          expect(res.headers.get('set-cookie')).toEqual('x-correlation-id=10; Max-Age=31536000; HttpOnly');
          expect(res.headers.get('authorization')).toBeNull();
          expect(fetchCorrelation).toHaveBeenCalledTimes(0);
          expect(createCorrelation).toHaveBeenCalledTimes(1);
          expect(updateCorrelation).toHaveBeenCalledTimes(0);
        });

        it('when x-correlation-id is existed', async () => {
          fetchCorrelation.mockImplementation(id => ({ id, isUnfamiliarCorrelation: true }));
          const { data } = await request('', '10');
          expect(data).toEqual({ viewer: 9 });
          expect(res.headers.get('set-cookie')).toBeNull();
          expect(res.headers.get('authorization')).toBeNull();
          expect(fetchCorrelation).toHaveBeenCalledTimes(1);
          expect(createCorrelation).toHaveBeenCalledTimes(0);
          expect(updateCorrelation).toHaveBeenCalledTimes(0);
        });

        it('when not found correlation', async () => {
          fetchCorrelation.mockImplementation(() => null);
          createCorrelation.mockImplementation(() => ({ id: '90', isUnfamiliarCorrelation: true }));
          const { data } = await request('', '10');
          expect(data).toEqual({ viewer: 9 });
          expect(res.headers.get('set-cookie')).toEqual('x-correlation-id=90; Max-Age=31536000; HttpOnly');
          expect(res.headers.get('authorization')).toBeNull();
          expect(fetchCorrelation).toHaveBeenCalledTimes(1);
          expect(createCorrelation).toHaveBeenCalledTimes(1);
          expect(updateCorrelation).toHaveBeenCalledTimes(0);
        });
      });

      describe('isUnfamiliarCorrelation is false', () => {
        it('when x-correlation-id is existed', async () => {
          fetchCorrelation.mockImplementation(id => ({ id, isUnfamiliarCorrelation: false }));
          updateCorrelation.mockImplementation((id, secret) => ({
            id, secret, isUnfamiliarCorrelation: false,
          }));
          const { data } = await request('', '10');
          expect(data).toEqual({ viewer: 9 });
          expect(res.headers.get('set-cookie')).toBeNull();
          expect(res.headers.get('authorization')).not.toBeNull();
          expect(fetchCorrelation).toHaveBeenCalledTimes(1);
          expect(createCorrelation).toHaveBeenCalledTimes(0);
          expect(updateCorrelation).toHaveBeenCalledTimes(1);
          expect(jwt.verifyWithCorrelation(res.headers.get('authorization'))).toEqual(expect.objectContaining({
            correlation: { id: '10', secret: expect.anything() },
            user: { id: '1' },
          }));
        });
      });
    });
  });

  describe('subscription', () => {
    const subscribe = async (token = '') => {
      req.token = token;
      wsLink.subscriptionClient.close();
      let subId;
      const result = await new Promise(async (subResolve, subReject) => {
        subId = await pubsub.subscribe('NEW_SUBSCRIPTION', subResolve);
        client
          .subscribe({ query: gql`subscription { viewer }` })
          .subscribe({ error: subReject });
      });
      pubsub.unsubscribe(subId);
      return result;
    };

    it('successfully get guest', async () => {
      const result = await subscribe('');
      expect(result).not.toEqual(expect.objectContaining({
        auth: expect.objectContaining({ user: expect.anything() }),
      }));
    });

    it('successfully get user', async () => {
      const token = jwt.signWithCorrelation({ id: '10' }, { id: '1' });
      const result = await subscribe(token);
      expect(result).toEqual(expect.objectContaining({
        auth: expect.objectContaining({ user: { id: '1' } }),
      }));
    });

    it('when token is not in safety time', async () => {
      const token = jwt.sign({ id: '10' }, { expiresIn: 24 * 60 * 60 });
      await expect(subscribe(token)).rejects.toEqual({ message: 'token is not safe' });
    });

    it('when token expired', async () => {
      const token = jwt.sign({ id: '10' }, { expiresIn: -1 });
      await expect(subscribe(token)).rejects.toEqual({ message: 'jwt expired' });
    });

    it('when token is invalid', async () => {
      const token = 'XXYYZZ';
      await expect(subscribe(token)).rejects.toEqual({ message: 'jwt malformed' });
    });
  });
});
