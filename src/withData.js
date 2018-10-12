import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { wrapDisplayName } from 'recompose';
import { thunk } from 'thelper';
import { ApolloProvider, getDataFromTree } from 'react-apollo';
import Head from 'next/head';
import initApollo from './initApollo';

export default (option) => {
  const optionThunk = thunk(option);
  return Component => class WithData extends React.Component {
    static displayName = wrapDisplayName(Component, 'WithData');

    static propTypes = {
      cache: PropTypes.shape(),
      url: PropTypes.shape(),
    };

    static defaultProps = {
      cache: {},
      url: {},
    }

    static getInitialProps(context) {
      const url = _.pick(context, ['query', 'pathname', 'asPath']);
      const initialProps = { context, url };
      const options = optionThunk(initialProps);

      const apollo = initApollo({}, { ...initialProps, ...options });

      return Promise.resolve()
        .then(() => {
          // Evaluate the composed component's getInitialProps()
          if (Component.getInitialProps) {
            return Component.getInitialProps(initialProps, apollo);
          }

          return { url };
        })
        .then((props) => {
          // Run all GraphQL queries in the component tree
          // and extract the resulting data
          if (process.browser || options.noSSR) return props;

          // Run all GraphQL queries
          return getDataFromTree(
            <ApolloProvider client={apollo}>
              <Component {...props} />
            </ApolloProvider>,
          ).then(() => {
            // getDataFromTree does not call componentWillUnmount
            // head side effect therefore need to be cleared manually
            Head.rewind();
            // Extract query data from the Apollo store
            return { cache: apollo.cache.extract(), ...props };
          }, () => (
            // Prevent Apollo Client GraphQL errors from crashing SSR.
            // Handle them in components via the data.error prop:
            // http://dev.apollodata.com/react/api-queries.html#graphql-query-data-error
            props
          ));
        });
    }

    componentWillMount() {
      const { cache } = this.props;
      const options = optionThunk(this.props);
      this.apollo = initApollo(cache, options);
    }

    render() {
      return (
        <ApolloProvider client={this.apollo}>
          <Component {...this.props} />
        </ApolloProvider>
      );
    }
  };
};
