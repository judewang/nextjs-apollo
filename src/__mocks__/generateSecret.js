const { default: generateSecret } = jest.requireActual('../generateSecret');
export default jest.fn(generateSecret);
