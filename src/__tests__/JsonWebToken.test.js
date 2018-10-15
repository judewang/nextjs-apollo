import _ from 'lodash';
import axios from 'axios';
import http from 'http';
import ws from 'ws';
import {
  execute,
  subscribe,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInt,
} from 'graphql';
import express from 'express';
import bodyParser from 'body-parser';
import {
  SubscriptionServer,
  SubscriptionClient,
} from 'subscriptions-transport-ws';
import JsonWebToken from '../JsonWebToken';

const toModel = jest.fn(values => Promise.resolve(values));
const toModelWithVerification = jest.fn(values => Promise.resolve(values));
const req = jest.fn();

const jwt = new JsonWebToken({ JWT_SECRET: 'XYZ' }, { toModel, toModelWithVerification });

const app = express();
const server = http.createServer(app);

server.listen();

const instance = axios.create({
  baseURL: `http://127.0.0.1:${server.address().port}/`,
});

const jwtParser = jwt.expressParser();

app.use(bodyParser.json());
app.use(async (appReq, appRes, next) => {
  await jwtParser(appReq, appRes); next();
});
app.use((appReq, appRes) => { req(appReq); appRes.send('ok'); });

const resolve = jest.fn(() => 1);
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({ name: 'Query', fields: { me: { type: GraphQLInt, resolve } } }),
});

new SubscriptionServer({ schema, subscribe, execute, onConnect: jwt.subscriptionParser() }, { server, path: '/' }); // eslint-disable-line

describe('expressParser', () => {
  describe('http', () => {
    describe('fetch cookie', () => {
      it('successfully get user', async () => {
        const token = jwt.sign({ id: '10' });
        toModel.mockImplementationOnce(values => Promise.resolve(values));
        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: `access_token=${token}` },
        });

        expect(toModel).toHaveBeenCalledWith({ id: '10' });
        expect(toModel).toHaveBeenCalledTimes(1);

        expect(headers['set-cookie']).toBeUndefined();
        expect(req).toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });

      it('when renew token', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: 60 * 60 });
        toModelWithVerification.mockImplementationOnce(values => Promise.resolve(values));
        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: `access_token=${token}` },
        });

        expect(toModelWithVerification).toHaveBeenCalledWith({ id: '10' });
        expect(toModelWithVerification).toHaveBeenCalledTimes(1);

        const [, accessToken] = /^access_token=([^;]+)/gi.exec(headers['set-cookie']);
        expect(jwt.verify(accessToken)).toEqual(expect.objectContaining({ data: { id: '10' } }));
        expect(req).toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });

      it('when verify values of token is invalid', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: 60 * 60 });

        toModelWithVerification.mockImplementationOnce(() => Promise.reject(new Error()));

        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: `access_token=${token}` },
        });

        expect(headers['set-cookie']).toBeUndefined();
        expect(req).not.toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });

      it('expired', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: -1 });

        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: `access_token=${token}` },
        });

        expect(headers['set-cookie']).toBeUndefined();
        expect(req).not.toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });

      it('when token is invalid', async () => {
        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: 'access_token=XXYYZZ' },
        });

        expect(headers['set-cookie']).toBeUndefined();
        expect(req).not.toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });
    });

    describe('fetch authorization', () => {
      it('successfully get user', async () => {
        const token = jwt.sign({ id: '10' });
        toModel.mockImplementationOnce(values => Promise.resolve(values));
        const { headers } = await instance.post('graphql', {}, {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(toModel).toHaveBeenCalledWith({ id: '10' });
        expect(toModel).toHaveBeenCalledTimes(1);

        expect(headers['set-cookie']).toBeUndefined();
        expect(req).toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });

      it('when renew token', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: 60 * 60 });
        toModelWithVerification.mockImplementationOnce(values => Promise.resolve(values));
        const { headers } = await instance.post('graphql', {}, {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(toModelWithVerification).toHaveBeenCalledWith({ id: '10' });
        expect(toModelWithVerification).toHaveBeenCalledTimes(1);

        const [, accessToken] = /^access_token=([^;]+)/gi.exec(headers['set-cookie']);
        expect(jwt.verify(accessToken)).toEqual(expect.objectContaining({ data: { id: '10' } }));
        expect(req).toHaveBeenCalledWith(expect.objectContaining({ user: { id: '10' } }));
      });
    });

    describe('signIn & signOut', () => {
      it('signIn', async () => {
        req.mockImplementation((appReq) => {
          expect(appReq.user).toBe(undefined);
          appReq.signIn({ id: '10' });
          expect(appReq.user).not.toBe(undefined);
        });
        const { headers } = await instance.post('graphql');

        const [, accessToken] = /^access_token=([^;]+)/gi.exec(headers['set-cookie']);
        expect(jwt.verify(accessToken)).toEqual(expect.objectContaining({ data: { id: '10' } }));
      });

      it('signOut', async () => {
        req.mockImplementation((appReq) => {
          expect(appReq.user).not.toBe(undefined);
          appReq.signOut();
          expect(appReq.user).toBe(undefined);
        });
        const token = jwt.sign({ id: '10' });
        const { headers } = await instance.post('graphql', {}, {
          headers: { Cookie: `access_token=${token}` },
        });
        expect(headers['set-cookie']).toEqual(['access_token=; Max-Age=-1; HttpOnly']);
      });
    });
  });

  describe('subscription', () => {
    describe('connectionParams', () => {
      const connect = async (token) => {
        const socket = new SubscriptionClient(
          `ws://127.0.0.1:${server.address().port}/`,
          { connectionParams: { authorization: `Bearer ${token}` } },
          ws,
        );

        let onConnected;
        const promiseConnected = new Promise((__) => { onConnected = __; });
        socket.onConnected(onConnected);

        await promiseConnected;

        let next;
        const promiseNext = new Promise((__) => { next = __; });
        socket.request({ query: 'query { me }' }).subscribe({ next });

        await promiseNext;

        return socket;
      };

      it('successfully get user', async () => {
        const token = jwt.sign({ id: '10' });

        const socket = await connect(token);

        expect(toModel).toHaveBeenCalledWith({ id: '10' });
        expect(toModel).toHaveBeenCalledTimes(1);

        expect(resolve).toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '10' } }),
          expect.anything(),
        );

        socket.close();
      });

      it('when renew token', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: 60 * 60 });

        const socket = await connect(token);

        expect(toModelWithVerification).toHaveBeenCalledWith({ id: '10' });
        expect(toModelWithVerification).toHaveBeenCalledTimes(1);

        expect(resolve).toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '10' } }),
          expect.anything(),
        );

        socket.close();
      });

      it('expired', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: -1 });

        const socket = await connect(token);

        expect(resolve).not.toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '10' } }),
          expect.anything(),
        );

        socket.close();
      });

      it('when token is invalid', async () => {
        const socket = await connect('');

        expect(resolve).not.toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '10' } }),
          expect.anything(),
        );

        socket.close();
      });
    });

    describe('cookie', () => {
      const connect = async (cookie) => {
        const WebSocket = _.assign((...args) => (new ws(...args, { headers: { cookie } })), ws); // eslint-disable-line

        const socket = new SubscriptionClient(
          `ws://127.0.0.1:${server.address().port}/`,
          {},
          WebSocket,
        );

        let onConnected;
        const promiseConnected = new Promise((__) => { onConnected = __; });
        socket.onConnected(onConnected);

        await promiseConnected;

        let next;
        const promiseNext = new Promise((__) => { next = __; });
        socket.request({ query: 'query { me }' }).subscribe({ next });

        await promiseNext;

        return socket;
      };

      it('successfully get user', async () => {
        const token = jwt.sign({ id: '10' });

        const socket = await connect(`access_token=${token}`);

        expect(toModel).toHaveBeenCalledWith({ id: '10' });
        expect(toModel).toHaveBeenCalledTimes(1);

        expect(resolve)
          .toHaveBeenLastCalledWith(undefined, {}, expect.objectContaining({ user: { id: '10' } }), expect.anything());

        socket.close();
      });

      it('when renew token', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: 60 * 60 });

        const socket = await connect(`access_token=${token}`);

        expect(toModelWithVerification).toHaveBeenCalledWith({ id: '10' });
        expect(toModelWithVerification).toHaveBeenCalledTimes(1);

        expect(resolve).toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '10' } }),
          expect.anything(),
        );

        socket.close();
      });

      it('expired', async () => {
        const token = jwt.sign({ id: '10' }, { expiresIn: -1 });

        const socket = await connect(`access_token=${token}`, token);

        expect(resolve).not.toHaveBeenLastCalledWith(
          undefined,
          {},
          expect.objectContaining({ user: { id: '20' } }),
          expect.anything(),
        );

        socket.close();
      });

      it('when token is invalid', async () => {
        const socket = await connect('access_token=XXYYZZ');

        expect(resolve)
          .not.toHaveBeenLastCalledWith(undefined, {}, expect.objectContaining({ user: { id: '10' } }), expect.anything());

        socket.close();
      });
    });
  });
});
