import _ from 'lodash';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

configure({ adapter: new Adapter() });

// https://github.com/airbnb/enzyme/issues/1295
export function diveTo(component, selector, options) {
  const result = component.find(selector);

  if (result.length > 0 || !component.dive) return result;
  const instance = component.instance() || {};

  const next = component.dive({
    ...options,
    context: _.assign(
      _.get(options, ['context'], {}),
      instance.getChildContext && instance.getChildContext(),
    ),
  });

  return diveTo(next, selector, options);
}

export * from 'enzyme';
