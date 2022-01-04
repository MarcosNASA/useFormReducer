export const truePredicate = () => true;

export const identity = (i) => i;

export const pipe = (...fns) => (...args) =>
  fns.reduce((soFar, fn) => fn(soFar), ...args);

export const callAll = (...fns) => (...args) => {
  fns.forEach((fn) => (typeof fn === "function" ? fn(...args) : void 0));
};

export const compose = (...fns) =>
  reduceRight(
    (prevFn, nextFn) => (...args) => {
      console.log({ args });
      return nextFn(prevFn(...args));
    },
    identity,
    fns
  );

export const getShallowDifference = (a, b) =>
  mixKeys(a, b).reduce(
    (keys, key) => [...keys, ...(!Object.is(a[key], b[key]) ? [key] : [])],
    []
  );

export const intersection = (firstList, ...lists) =>
  lists.reduce(
    (set, list) => list.filter((listElement) => set.includes(listElement)),
    firstList
  );

const mixKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

export const noop = () => {};

export const reduce = (reducer, initialValue, iterable) => {
  let accumulator = initialValue;

  for (const [index, value] of Object.entries(iterable)) {
    accumulator = reducer(accumulator, value, index, iterable);
  }

  return accumulator;
};

const reduceRight = (reducer, initialValue, iterable) => {
  let accumulator = initialValue;

  for (const [index, value] of Object.entries([...iterable].reverse())) {
    accumulator = reducer(accumulator, value, index, iterable);
  }

  return accumulator;
};

const nestedKeyToList = (property) =>
  Array.isArray(property) ? property : property.split(/[.,]/g);

export const getNestedPropertyValue = (object, key) =>
  nestedKeyToList(key).reduce((soFar, property) => soFar?.[property], object);

export const updateObjectDeeply = (object, { property, value }) => {
  const [currentProperty, ...otherProperties] = nestedKeyToList(property);
  const isArray = Array.isArray(object);

  if (otherProperties.length === 0) {
    return isArray
      ? [
          ...object.slice(0, Number(currentProperty)),
          value,
          ...object.slice(Number(currentProperty) + 1)
        ]
      : {
          ...object,
          [currentProperty]: value
        };
  }

  return isArray
    ? [
        ...object.slice(0, Number(currentProperty)),
        updateObjectDeeply(object[currentProperty], {
          property: otherProperties,
          value
        }),
        ...object.slice(Number(currentProperty) + 1)
      ]
    : {
        ...object,
        [currentProperty]: updateObjectDeeply(object[currentProperty], {
          property: otherProperties,
          value
        })
      };
};

export const prefixKeys = (object, prefix) =>
  Object.fromEntries(
    Object.entries(object).map(([key, value]) => [`${prefix}${key}`, value])
  );

/**
 * Given an array of objects "[{a: 1, b: 2}, {a: 3, b: 4}]", flattens it into
 * {
 *  0.a: 1,
 *  0.b, 2,
 *  1.a: 3,
 *  2.b, 4,
 * }
 * @param {Array} array
 * @returns The input array flattened into an object whichs keys are prefixed by the original position of the object in the array.
 */
export const flattenArrayOfObjectsIntoPositionedObject = (array) =>
  array.reduce(
    (soFar, object, index) => ({
      ...soFar,
      ...prefixKeys(object, `${index}.`)
    }),
    {}
  );

export const getNestedPropertyKeyDescriptor = (key) =>
  key.replace(/\d\.*/i, "");
