import {
  GraphQLID, GraphQLInt, GraphQLString, GraphQLSchema, GraphQLInterfaceType, GraphQLObjectType,
} from 'graphql';
import fragmentTypes, { execFile } from '../fragmentTypes';

const Animal = new GraphQLInterfaceType({
  name: 'Animal',
  fields: {
    id: { type: GraphQLID },
    name: { type: GraphQLString },
  },
  resolveType({ type }) {
    return type;
  },
});

const Cat = new GraphQLObjectType({
  name: 'Cat',
  interfaces: [Animal],
  fields: {
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    group: { type: GraphQLInt },
  },
});

const Dog = new GraphQLObjectType({
  name: 'Dog',
  interfaces: [Animal],
  fields: {
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    home: { type: GraphQLString },
  },
});

const Sunflower = new GraphQLObjectType({
  name: 'Sunflower',
  fields: {
    id: { type: GraphQLID },
    createdAt: { type: GraphQLString },
  },
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      cat: { type: Cat },
      dog: { type: Dog },
      sunflower: { type: Sunflower },
    },
  }),
});

describe('fragmentTypes', () => {
  it('successfully generated json', async () => {
    expect(await fragmentTypes(schema)).toMatchSnapshot();
  });

  it('execFile', async () => {
    expect(await execFile(schema)).toMatchSnapshot();
  });
});
