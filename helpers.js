export const callAll = (...fns) => (...args) => {
  fns.forEach((fn) => typeof fn === "function" && fn(...args));
};
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
export const getNestedPropertyValue = (object, key) =>
  nestedKeyToList(key).reduce((soFar, property) => soFar?.[property], object);
export const getTrue = () => true;
export const identity = (id) => id;
export const intersect = (firstList, ...lists) =>
  lists.reduce(
    (intersection, list) =>
      list.filter((listElement) => intersection.includes(listElement)),
    firstList
  );
const nestedKeyToList = (property) =>
  Array.isArray(property) ? property : property.split(/[.,]/g);
export const pipe = (...fns) => (...args) =>
  fns.reduce((soFar, fn) => fn(soFar), ...args);
export const prefixKeys = (object, prefix) =>
  Object.fromEntries(
    Object.entries(object).map(([key, value]) => [`${prefix}${key}`, value])
  );
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
