import React from 'react';
import Head from 'next/head';
import PropTypes from 'prop-types';
import { getDataFromTree } from 'react-apollo';
import thunk from 'thelper/thunk';
import initApollo from './initApollo';

export default (options = {}) => {
  const thunkOption = thunk(options);

  return App => class Apollo extends React.Component {
    static displayName = 'withApollo(App)'

    static propTypes = {
      apolloState: PropTypes.shape().isRequired,
    };

    static childContextTypes = {
      client: PropTypes.shape(),
    };

    static async getInitialProps(ctx = {}) {
      const { Component, router } = ctx;

      const appProps = App.getInitialProps ? await App.getInitialProps(ctx) : {};

      const apolloClient = initApollo({}, thunkOption(appProps));

      if (!process.browser) {
        try {
          await getDataFromTree(
            <App
              {...appProps}
              Component={Component}
              router={router}
              apolloClient={apolloClient}
            />,
          );
        } catch (error) {
          console.error('Error while running `getDataFromTree`', error.message); // eslint-disable-line
        }

        Head.rewind();
      }

      const apolloState = apolloClient.cache.extract();

      return { ...appProps, apolloState };
    }

    constructor(props) {
      super(props);
      this.apolloClient = initApollo(props.apolloState, thunkOption(props));
    }

    render() {
      return <App {...this.props} apolloClient={this.apolloClient} />;
    }
  };
};
