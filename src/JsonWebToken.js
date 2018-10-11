import _ from 'lodash';
import NodeRSA from 'node-rsa';
import cookie from 'cookie';
import jsonwebtoken from 'jsonwebtoken';

const EXPIRED_IN = 7 * 24 * 60 * 60; // 7 days in seconds

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

    const { toValues, toModel, toModelWithVerification } = _.defaults(handlers, {
      toValues: obj => obj.valueOf(),
      toModel: _.identity,
      toModelWithVerification: _.identity,
    });

    this.toValues = toValues;
    this.toModel = toModel;
    this.toModelWithVerification = toModelWithVerification;

    return this;
  }

  sign(data, options) {
    const opt = _.defaults({}, options, this.options, this.algorithm);
    return jsonwebtoken.sign({ data }, this.privateKey, opt);
  }

  verify(token, options) {
    const opt = _.defaults({}, options, this.options, { algorithms: ['HS256', 'RS256'] });
    return jsonwebtoken.verify(token, this.publicKey, opt);
  }

  async fetchModel(token) {
    const { toModel, toModelWithVerification } = this;
    const { data, exp } = this.verify(token);
    const expiresOn = exp - (Date.now() / 1000);

    const renewToken = expiresOn < (EXPIRED_IN - (60 * 60));

    const user = await (renewToken ? toModelWithVerification(data) : toModel(data));

    return { user, renewToken };
  }

  expressParser() {
    return async (req, res, next) => {
      const { toValues } = this;

      req.signIn = (model) => {
        req.user = model;

        const values = toValues(model);
        res.append('Set-Cookie', cookie.serialize(
          'access_token',
          this.sign(values),
          { httpOnly: true, maxAge: 60 * 60 * 24 * 7 },
        ));
      };

      req.signOut = () => {
        req.user = undefined;

        res.append('Set-Cookie', cookie.serialize(
          'access_token',
          '',
          { httpOnly: true, maxAge: -1 },
        ));
      };

      const cookies = cookie.parse(_.get(req, ['headers', 'cookie'], ''));

      try {
        if (cookies.access_token) {
          const { user, renewToken } = await this.fetchModel(cookies.access_token);
          req.user = user;
          if (renewToken) req.signIn(user);
        }
      } catch (e) {
        // empty
      }

      try {
        const token = /^Bearer (.+)$/.exec(req.headers.authorization);
        if (token) {
          const { user, renewToken } = await this.fetchModel(token[1]);
          req.user = user;
          if (renewToken) req.signIn(user);
        }
      } catch (e) {
        // empty
      }

      next();
    };
  }

  subscriptionParser() {
    return async (params, ws) => {
      const cookies = cookie.parse(_.get(ws, ['upgradeReq', 'headers', 'cookie'], ''));
      try {
        if (cookies.access_token) {
          const { user } = await this.fetchModel(cookies.access_token);
          return { ...params, user };
        }
      } catch (e) {
        // empty
      }

      try {
        const token = /^Bearer (.+)$/.exec(params.authorization);
        if (token) {
          const { user } = await this.fetchModel(token[1]);
          return { ...params, user };
        }
      } catch (e) {
        // empty
      }

      return params;
    };
  }
}
