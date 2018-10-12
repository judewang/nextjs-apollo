import set from 'lodash/set';
import get from 'lodash/get';
import filter from 'lodash/filter';
import { graphql } from 'graphql';

export default function builder(schema) {
  return graphql(schema, '{ __schema { types { kind name possibleTypes { name } } } }')
    .then(({ data }) => {
      const types = filter(get(data, ['__schema', 'types']), ({ possibleTypes }) => possibleTypes !== null);
      set(data, ['__schema', 'types'], types);
      return JSON.stringify(data);
    });
}

export function execFile(schema) {
  return builder(schema)
    .then(data => data
      .replace(/"([_\w]+)":/gi, (...args) => ` ${args[1]}: `)
      .replace(/"([_\w]+)"/gi, (...args) => `'${args[1]}'`)
      .replace(/([^ ])}/gi, (...args) => `${args[1]} }`)
      .replace(/([^ ])}/gi, (...args) => `${args[1]} }`)
      .replace(/,([^ ])/gi, (...args) => `, ${args[1]}`))
    .then(data => `export default ${data};\n`);
}
