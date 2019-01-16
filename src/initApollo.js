import 'isomorphic-unfetch';
import _ from 'lodash';
import { ApolloClient } from 'apollo-client';
import { ApolloLink } from 'apollo-link';
import { BatchHttpLink } from 'apollo-link-batch-http';
import { WebSocketLink } from 'apollo-link-ws';
import { RetryLink } from 'apollo-link-retry';
import { onError } from 'apollo-link-error';
import { getMainDefinition } from 'apollo-utilities';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { persistCache } from 'apollo-cache-persist';
import localStorage from './localStorage';

function createLink(apollo, options) {
  const { uri, retry, http } = options;

  const retryLink = new RetryLink({ ...retry });

  const errorLink = onError((result) => {
    const { client } = apollo;
    const { graphQLErrors: err } = result;
    if (_.get(err, [0, 'extensions', 'code']) === 'UNAUTHENTICATED') {
      client.signOut();
    }
    return options.onError(result);
  });

  const authLink = new ApolloLink((operation, forward) => {
    const { client } = apollo;
    operation.setContext(({ headers }) => ({
      headers: { ...headers, authorization: client.token },
    }));
    return forward(operation).map((response) => {
      const { response: { headers } } = operation.getContext();
      const token = headers.get('authorization');
      if (token) client.token = token;
      return response;
    });
  });

  const batchLink = new BatchHttpLink({ uri, ...http });

  const httpLink = ApolloLink.from([retryLink, errorLink, authLink, batchLink]);

  if (!process.browser) return httpLink;

  const { uri: wsUri, webSocketImpl, ...ws } = options.ws;
  const wsLink = new WebSocketLink({
    uri: wsUri || _.replace(uri, /^http/i, 'ws'),
    options: {
      connectionParams: () => {
        const { client } = apollo;
        return { authorization: client.token };
      },
      ...ws,
    },
    webSocketImpl,
  });

  return ApolloLink.split(({ query }) => {
    const { kind, operation } = getMainDefinition(query);
    return kind === 'OperationDefinition' && operation === 'subscription';
  }, wsLink, httpLink);
}

function create(initialState, ...args) {
  const options = _.defaultsDeep(args[0], {
    uri: '/graphql',
    retry: {
      attempts: {
        retryIf: (err) => {
          const errorCode = _.get(err, ['result', 'errors', 0, 'extensions', 'code']);
          return errorCode === 'INTERNAL_SERVER_ERROR';
        },
      },
    },
    http: { credentials: 'same-origin' },
    ws: {},
    onError: () => {},
    onSignOut: _.identity,
  });

  const cache = new InMemoryCache(options.cache).restore(initialState);

  if (process.browser) persistCache({ cache, storage: localStorage });

  const apollo = {};

  const client = new ApolloClient({
    connectToDevTools: process.browser && process.env.NODE_ENV === 'production',
    ssrMode: !process.browser,
    link: createLink(apollo, options),
    cache,
  });

  client.signOut = () => {
    client.token = '';
    options.onSignOut();
  };

  Object.defineProperty(client, 'token', {
    get() {
      const value = localStorage.getItem('nextjs-apollo-token');
      if (value) return `Bearer ${value}`;
      return '';
    },
    set(value) {
      localStorage.setItem('nextjs-apollo-token', value);
    },
  });

  apollo.client = client;

  return client;
}

export default function initApollo(initialState, options) {
  if (!process.browser) return create(initialState, options);
  if (!initApollo.client) initApollo.client = create(initialState, options);
  return initApollo.client;
}
