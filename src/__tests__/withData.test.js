import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import http from 'http';
import gql from 'graphql-tag';
import express from 'express';
import ws from 'ws';
import bodyParser from 'body-parser';
import { PubSub } from 'graphql-subscriptions';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { render } from 'enzyme';
import { graphql } from 'react-apollo';
import { execute } from 'apollo-link';
import { graphqlExpress } from 'apollo-server-express';
import {
  subscribe, GraphQLString, GraphQLSchema, GraphQLObjectType,
} from 'graphql';
import { withData, initApollo } from '..';

const pubsub = new PubSub();

const resolveSpy = jest.fn(payload => payload * 2);
const subscribeSpy = jest.fn(() => pubsub.asyncIterator('me'));

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      me: {
        type: GraphQLString,
        resolve: resolveSpy,
      },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      me: {
        type: GraphQLString,
        subscribe: subscribeSpy,
      },
    },
  }),
});

const app = express();
app.use('/graphql', bodyParser.json(), graphqlExpress(
  req => ({ schema, context: _.pick(req.headers, ['x-hackers']) }),
));

const server = http.createServer(app);
server.listen();

const { port } = server.address();

new SubscriptionServer({ // eslint-disable-line
  schema,
  subscribe,
  execute,
  onConnect: params => params,
}, { server, path: '/' });

class App extends React.Component {
  static propTypes = {
    value: PropTypes.number,
    data: PropTypes.shape(),
  }

  static defaultProps = {
    value: 0,
    data: {},
  }

  static async getInitialProps() {
    return { value: 99 };
  }

  render() {
    const { value, data } = this.props;

    return (
      <div>
        {`${_.get(data, ['me'])} value: ${value}`}
      </div>
    );
  }
}

const apollo = {
  httpUri: `http://localhost:${port}/graphql`,
  wsUri: `ws://localhost:${port}/`,
  webSocketImpl: ws,
};

describe('withData', () => {
  describe('process.browser is false', () => {
    beforeEach(() => {
      process.browser = false;
    });

    it('when NoSSR', async () => {
      const WrapApp = withData({ ...apollo, noSSR: true })(
        graphql(gql`query { me }`)(App),
      );

      const props = await WrapApp.getInitialProps();
      expect(props).toMatchSnapshot();
      expect(resolveSpy).toHaveBeenCalledTimes(0);

      const component = render(<WrapApp {...props} />);
      expect(component).toMatchSnapshot();
    });

    it('when getInitialProps', async () => {
      resolveSpy.mockReturnValueOnce(Promise.resolve('hello'));
      const WrapApp = withData(apollo)(
        graphql(gql`query { me }`)(App),
      );

      const props = await WrapApp.getInitialProps();
      expect(props).toMatchSnapshot();

      expect(resolveSpy).toHaveBeenLastCalledWith(
        undefined, {}, {}, expect.anything(),
      );
      expect(resolveSpy).toHaveBeenCalledTimes(1);

      const component = render(<WrapApp {...props} />);
      expect(component).toMatchSnapshot();
    });

    it('when no getInitialProps', async () => {
      resolveSpy.mockReturnValueOnce(Promise.resolve('hello'));
      const WrapApp = withData(apollo)(graphql(gql`query { me }`)(() => <div />));
      expect(await WrapApp.getInitialProps()).toMatchSnapshot();
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it('when throw error', async () => {
      resolveSpy.mockImplementationOnce(() => Promise.reject(new Error()));
      const WrapApp = withData(apollo)(graphql(gql`query { me }`)(App));

      const props = await WrapApp.getInitialProps();
      expect(props).toMatchSnapshot();

      expect(resolveSpy).toHaveBeenLastCalledWith(
        undefined, {}, {}, expect.anything(),
      );
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('process.browser is true', () => {
    beforeEach(() => {
      process.browser = true;
      initApollo.client = null;
    });

    it('getInitialProps', async () => {
      const WrapApp1 = withData(apollo)(graphql(gql`query { me }`)(App));
      expect(await WrapApp1.getInitialProps()).toEqual({ value: 99 });

      const WrapApp2 = withData(apollo)(graphql(gql`query { me }`)(App));
      expect(await WrapApp2.getInitialProps()).toEqual({ value: 99 });

      expect(resolveSpy).toHaveBeenCalledTimes(0);
    });

    it('no websocket', async () => {
      const WrapApp = withData({ ...apollo, wsUri: undefined })(
        graphql(gql`query { me }`)(App),
      );
      expect(await WrapApp.getInitialProps()).toEqual({ value: 99 });
      expect(resolveSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('initApollo', () => {
    beforeEach(() => {
      process.browser = true;
      initApollo.client = null;
    });

    it('init', async () => {
      expect(initApollo()).toMatchSnapshot();
      expect(initApollo()).toBe(initApollo());
    });

    it('subscription', async () => {
      let resolve;
      const promise = new Promise((__) => { resolve = __; });
      subscribeSpy.mockImplementationOnce(resolve);

      const client = initApollo({}, apollo);
      execute(client.link, { query: gql`subscription { me }` }).subscribe({});

      await promise;

      expect(subscribeSpy).toHaveBeenLastCalledWith(undefined, {}, {}, expect.anything());
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });

    it('query', async () => {
      let resolve;
      const promise = new Promise((__) => { resolve = __; });
      resolveSpy.mockImplementationOnce(resolve);

      const client = initApollo({}, apollo);
      execute(client.link, { query: gql`query { me }` }).subscribe({});
      await promise;

      expect(resolveSpy).toHaveBeenLastCalledWith(undefined, {}, {}, expect.anything());
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });

    it('headers', async () => {
      let resolve;
      const promise = new Promise((__) => { resolve = __; });
      resolveSpy.mockImplementationOnce(resolve);

      const client = initApollo({}, { ...apollo, headers: () => ({ 'x-hackers': '999' }) });
      execute(client.link, { query: gql`query { me }` }).subscribe({});
      await promise;

      expect(resolveSpy).toHaveBeenLastCalledWith(undefined, {}, { 'x-hackers': '999' }, expect.anything());
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
  });
});
