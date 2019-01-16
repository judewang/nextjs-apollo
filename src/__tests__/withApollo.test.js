import 'isomorphic-unfetch';
import http from 'http';
import React from 'react';
import ws from 'ws';
import { ApolloProvider, Query } from 'react-apollo';
import gql from 'graphql-tag';
import express from 'express';
import { shallow, diveTo } from 'enzyme';
import PropTypes from 'prop-types';
import { ApolloServer, PubSub } from 'apollo-server-express';
import { withApollo } from '..';

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
  typeDefs,
  resolvers,
  context,
});

const app = express();
apolloServer.applyMiddleware({ app });

const server = http.createServer(app);
apolloServer.installSubscriptionHandlers(server);
server.listen();

const { port } = server.address();

const wrapApollo = withApollo({
  uri: `http://localhost:${port}/graphql`,
  ws: { webSocketImpl: ws },
});

describe('withApollo', () => {
  let Main;
  let Apollo;

  beforeEach(() => {
    Main = class extends React.Component {
      static propTypes = {
        apolloClient: PropTypes.shape().isRequired,
      };

      static childContextTypes = {
        client: PropTypes.shape(),
      };

      getChildContext() {
        const { apolloClient } = this.props;
        return { client: apolloClient };
      }

      render() {
        const { apolloClient } = this.props;

        return (
          <ApolloProvider client={apolloClient}>
            <Query query={gql`query { viewer }`}>
              {({ data }) => (<div>{data.viewer}</div>)}
            </Query>
          </ApolloProvider>
        );
      }
    };

    Apollo = jest.fn(props => <Main {...props} />);
  });

  describe('on server', () => {
    beforeEach(() => { process.browser = false; });

    it('successfully get data', async () => {
      const App = Apollo |> wrapApollo;
      const props = await App.getInitialProps();
      expect(props).toEqual({ apolloState: { ROOT_QUERY: { viewer: 1 } } });
      expect(diveTo(shallow(<App {...props} />), 'div').html()).toBe('<div>1</div>');
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('successfully get data with getInitialProps', async () => {
      Apollo.getInitialProps = () => ({ name: 'nextjs-apollo' });

      const App = Apollo |> wrapApollo;
      const props = await App.getInitialProps();
      expect(props).toEqual({
        apolloState: { ROOT_QUERY: { viewer: 1 } }, name: 'nextjs-apollo',
      });
      expect(diveTo(shallow(<App {...props} />), 'div').html()).toBe('<div>1</div>');
    });

    it('when render error', async () => {
      console.error = jest.fn();  // eslint-disable-line
      const Component = () => { throw new Error('render error'); };
      const App = Component |> withApollo();
      await App.getInitialProps();
      expect(console.error).toHaveBeenCalledWith(  // eslint-disable-line
        'Error while running `getDataFromTree`',
        'render error',
      );
    });
  });

  describe('on browser', () => {
    beforeEach(() => { process.browser = true; });

    it('successfully render', async () => {
      const App = Apollo |> wrapApollo;
      const props = await App.getInitialProps();
      expect(props).toEqual({ apolloState: {} });
      expect(diveTo(shallow(<App {...props} />), 'div').html()).toBe('<div></div>');
      await new Promise(next => setTimeout(next, 500));
      expect(diveTo(shallow(<App {...props} />), 'div').html()).toBe('<div>1</div>');
      expect(Apollo.mock.calls[0]).toEqual(Apollo.mock.calls[1]);
    });
  });
});
