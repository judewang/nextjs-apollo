const { default: localStorage } = jest.requireActual('../localStorage');
export default {
  setItem: jest.fn(localStorage.setItem),
  getItem: jest.fn(localStorage.getItem),
  removeItem: jest.fn(localStorage.removeItem),
};
