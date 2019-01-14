import window from 'global/window';

export default window.localStorage || {
  setItem: () => undefined,
  getItem: () => undefined,
};
