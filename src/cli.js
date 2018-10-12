#!/usr/bin/env node
import fs from 'fs';
import { execFile } from './fragmentTypes';
import jwt from './JsonWebToken';

switch (process.argv[1]) {
  case 'key':
    console.log(jwt.generateKey()); // eslint-disable-line
    process.exit();
    break;
  case 'fragment':
    execFile(require(process.argv[2])) // eslint-disable-line
      .then(data => fs.writeFileSync(process.argv[3], data))
      .then(() => process.exit());
    break;
  default:
}
