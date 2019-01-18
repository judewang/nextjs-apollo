import _ from 'lodash';
import NodeRSA from 'node-rsa';
import cookie from 'cookie';
import { assertEnv } from 'thelper';
import jsonwebtoken from 'jsonwebtoken';
import { AuthenticationError } from 'apollo-server-express';
import generateSecret from './generateSecret';

const EXPIRED_IN = 14 * 24 * 60 * 60; // 7 days in seconds

export default class JsonWebToken {
  static generateKey() {
    return Buffer.from(new NodeRSA().generateKeyPair().exportKey('pkcs1-private-pem')).toString('base64');
  }

  constructor(env = {}, handlers = {}) {
    if (env.PRIVATE_KEY) {
      this.privateKey = Buffer.from(env.PRIVATE_KEY, 'base64');
      this.publicKey = new NodeRSA(this.privateKey).exportKey('pkcs8-public-pem');
      this.algorithm = { algorithm: 'RS256' };
    } else {
      this.privateKey = _.defaultTo(env.JWT_SECRET, env.HEROKU_APP_ID);
      this.publicKey = this.privateKey;
    }

    if (!this.privateKey) {
      throw new TypeError('PRIVATE_KEY or JWT_SECRET least one is required');
    }

    this.options = {
      expiresIn: _.defaultTo(env.JWT_EXPIRES_IN, EXPIRED_IN), // one hour in seconds
      issuer: _.defaultTo(env.JWT_ISSUER, 'jwt'),
      subject: _.defaultTo(env.JWT_ISSUER, 'jwt'),
      audience: _.defaultTo(env.JWT_AUDIENCE, 'everyone'),
    };

    _.assign(this, _.pick(_.defaults(handlers, {
      toValues: _.identity,
      toModel: _.identity,
      createCorrelation: _.identity,
      updateCorrelation: _.identity,
      fetchCorrelation: _.identity,
    }), [
      'toValues', 'toModel',
      'createCorrelation', 'updateCorrelation', 'fetchCorrelation',
    ]));

    return this;
  }

  sign(data, options) {
    const opt = _.defaults({}, options, this.options, this.algorithm);
    return jsonwebtoken.sign(data, this.privateKey, opt);
  }

  verify(token, options) {
    const opt = _.defaults({}, options, this.options, { algorithms: ['HS256', 'RS256'] });
    return jsonwebtoken.verify(token, this.publicKey, opt);
  }

  signWithCorrelation(correlation, user, ...args) {
    return this.sign({ correlation, user: this.toValues(user) }, ...args);
  }

  verifyWithCorrelation(token, ...args) {
    const { correlation, user, exp } = this.verify(token, ...args);
    const expiresOn = exp - (Date.now() / 1000);
    return { correlation, user: this.toModel(user), expiresOn };
  }

  async renewWithCorrelation({ id, secret }, auth, req) {
    const correlation = await this.fetchCorrelation(id, auth, req);
    if (!(correlation && correlation.secret === secret)) throw new Error('not match to secret');

    const renew = String(generateSecret());

    await this.updateCorrelation(id, renew, auth, req);
    return this.signWithCorrelation({ id, secret: renew }, auth.user);
  }

  async declareCorrelation(id, auth, req) {
    const correlation = id && await this.fetchCorrelation(id, auth, req);
    if (correlation) return correlation;

    return this.createCorrelation(auth, req);
  }

  async registerCorrelation(id, auth, req) {
    const correlation = await this.declareCorrelation(id, auth, req);

    if (correlation.isUnfamiliarCorrelation) return correlation;

    return this.updateCorrelation(id, String(generateSecret()), auth, req);
  }

  async convertTokenToUser(auth, req, res) {
    const { token, correlationId } = auth;
    if (!token) return null;

    const { options } = this;
    const { correlation, user, expiresOn } = this.verifyWithCorrelation(token);

    const isExpired = expiresOn < (options.expiresIn - (60 * 60));

    if (req) {
      if (!(correlationId && correlationId === correlation.id)) {
        throw new Error('not match to correlation id');
      }

      if (isExpired) {
        res.append('authorization', await this.renewWithCorrelation(correlation, { ...auth, user }, req));
      }

      return user;
    }

    if (isExpired) throw new Error('token is not safe');
    return user;
  }

  contextParser() {
    return async (context) => {
      const { req, res, connection } = context;

      const auth = {
        signIn: async (user) => {
          auth.user = user;

          const correlation = await this.registerCorrelation(auth.correlationId, auth, req);

          if (auth.correlationId !== correlation.id) {
            res.append('Set-Cookie', cookie.serialize(
              'x-correlation-id',
              correlation.id,
              { httpOnly: true, maxAge: 365 * 24 * 60 * 60 },
            ));
          }

          if (!correlation.isUnfamiliarCorrelation) {
            const { id, secret } = correlation;
            const token = this.signWithCorrelation({ id, secret }, auth.user);
            res.append('authorization', token);
            return { correlation, token };
          }

          return { correlation };
        },
      };

      try {
        const { authorization } = connection ? connection.context : req.headers;
        const [, token] = /^Bearer (.+)$/.exec(authorization);
        auth.token = token;
      } catch (e) {
        // empty
      }

      try {
        auth.correlationId = cookie.parse(req.headers.cookie)['x-correlation-id'];
      } catch (e) {
        // empty
      }

      try {
        const user = await this.convertTokenToUser(auth, req, res);
        auth.user = user;
        return { ...context, auth };
      } catch (e) {
        assertEnv(() => {
          if (!res) throw new AuthenticationError(e.message);
          res.append('X-Content-Extend', e.message);
        });
        throw new AuthenticationError('must authenticate');
      }
    };
  }
}
