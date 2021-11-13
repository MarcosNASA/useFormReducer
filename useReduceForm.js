import React from "react";
import {
  callAll,
  flattenArrayOfObjectsIntoPositionedObject,
  getNestedPropertyValue,
  getTrue,
  identity,
  noop,
  pipe,
  prefixKeys,
  updateObjectDeeply
} from "./helpers";

export const VALIDATION_MODE = {
  onChange: "onChange",
  onSubmit: "onSubmit",
  onBlur: "onBlur"
};

const getDirtyFields = ({ initial, current, field, dirtyFields }) =>
  Object.is(
    getNestedPropertyValue(initial, field),
    getNestedPropertyValue(current, field)
  )
    ? dirtyFields.filter((dirtyField) => dirtyField !== field)
    : [...new Set([...dirtyFields, field])];

export const useReduceForm = ({
  initialValue,
  validations = {},
  dependencies = {},
  mode = VALIDATION_MODE.onChange,
  reValidateMode = VALIDATION_MODE.onSubmit,
  reducer: customReducer
}) => {
  const initialValueRef = React.useRef(initialValue);
  const [formState, setFormState] = React.useState({
    form: { ...initialValue },
    dirtyFields: [],
    hasInvalidFields: false,
    invalidFields: [],
    touchedFields: [],
    hasRevalidated: false
  });
  const { dirtyFields, touchedFields, form } = formState;

  const validateField = React.useMemo(
    () => makeFieldValidator({ validations, dependencies }),
    [validations, dependencies]
  );

  const reducers = customReducer || [
    ...(Object.keys(dependencies).length > 0
      ? [makeDependencyReducer({ dependencies })]
      : []),
    ...(Object.keys(validations).length > 0
      ? [makeValidationReducer({ validations })]
      : [])
  ];

  const revalidate = (newFormState = formState) => ({
    ...reduceForm({ ...newFormState, invalidFields: [] }, reducers),
    hasRevalidated: true
  });

  const handleChange = ({ name, value }) => {
    const newFormState = {
      ...formState,
      form: updateObjectDeeply(form, { property: name, value })
    };

    const shouldValidate = mode === VALIDATION_MODE.onChange;
    const shouldRevalidate = reValidateMode === VALIDATION_MODE.onChange;
    // prettier-ignore
    const { form: updatedForm, invalidFields: updatedInvalidFields } = shouldRevalidate
            ? revalidate(newFormState)
            : shouldValidate
              ? validateField(newFormState, { name })
              : newFormState

    setFormState({
      ...formState,
      form: updatedForm,
      dirtyFields: getDirtyFields({
        initial: initialValueRef.current,
        current: updatedForm,
        field: name,
        dirtyFields
      }),
      ...((shouldValidate || shouldRevalidate) && {
        hasInvalidFields: updatedInvalidFields.length > 0,
        invalidFields: updatedInvalidFields
      })
    });
  };

  const handleBlur = ({ target: { name } }) => {
    if (![mode, reValidateMode].includes(VALIDATION_MODE.onBlur)) return;

    const {
      form: updatedForm,
      invalidFields: updatedInvalidFields
    } = validateField(formState, { name });

    setFormState({
      ...formState,
      form: updatedForm,
      invalidFields: updatedInvalidFields,
      hasInvalidFields: updatedInvalidFields.length > 0
    });
  };

  const handleFocus = ({ target: { name } }) => {
    setFormState({
      ...formState,
      touchedFields: [...new Set([...touchedFields, name])]
    });
  };

  const register = ({
    name,
    type,
    onBlur: customHandleBlur,
    onChange: customHandleChange = identity,
    onFocus: customHandleFocus,
    ...otherProps
  } = {}) => ({
    ...otherProps,
    type,
    name: Array.isArray(name) ? name.join(".") : name,
    value: getNestedPropertyValue(form, name) || "",
    onBlur: callAll(customHandleBlur, handleBlur),
    onChange: pipe(customHandleChange, handleChange),
    onFocus: callAll(customHandleFocus, handleFocus)
  });

  const handleSubmit = (onValid = noop, onInvalid = noop) => (event) => {
    event.preventDefault();

    const shouldValidate = [mode, reValidateMode].includes(
      VALIDATION_MODE.onSubmit
    );

    const updatedFormState = shouldValidate ? revalidate(formState) : formState;
    setFormState(updatedFormState);

    const {
      hasInvalidFields: hasInvalidFieldsAfterRevalidation
    } = updatedFormState;
    initialValueRef.current = hasInvalidFieldsAfterRevalidation
      ? initialValueRef.current
      : form;
    const customHandleSubmit = hasInvalidFieldsAfterRevalidation
      ? onInvalid
      : onValid;
    customHandleSubmit(updatedFormState, { clear, setFormState, revalidate });
  };

  const clear = () => {
    setFormState({
      ...formState,
      touchedFields: [],
      dirtyFields: [],
      invalidFields: []
    });
  };

  return [
    formState,
    { clear, handleSubmit, register, revalidate, setFormState }
  ];
};

const getNestedPropertyKeyDescriptor = (key) => key.replace(/\d\.*/i, "");

const makeFieldValidator = ({ validations, dependencies }) => (
  formState,
  { name }
) => {
  const { form, invalidFields } = formState;

  const relevantFieldGetter =
    getNestedPropertyValue(
      dependencies,
      getNestedPropertyKeyDescriptor(name)
    ) || getTrue;
  const isRelevantField = relevantFieldGetter(form);
  const newForm = isRelevantField
    ? form
    : updateObjectDeeply(form, {
        property: name,
        value: ""
      }); /* clears non-relevant fields */

  const validFieldGetter =
    getNestedPropertyValue(validations, getNestedPropertyKeyDescriptor(name)) ||
    getTrue;
  const isValidField = isRelevantField
    ? validFieldGetter({
        name,
        value: getNestedPropertyValue(newForm, name),
        form: newForm
      })
    : true;
  const newInvalidFields = isValidField
    ? invalidFields.filter((field) => field !== name)
    : [...new Set([...invalidFields, name])];

  return {
    ...formState,
    form: newForm,
    invalidFields: newInvalidFields
  };
};

const reduceForm = (formState, reducers) =>
  [reducers]
    .flat(Infinity)
    .reduce(
      (calculatedFormState, reducer) =>
        Object.entries(selectForm(formState)).reduce(
          reducer,
          calculatedFormState
        ),
      formState
    );

const selectForm = ({ form }) => form;

const makeDependencyReducer = ({ dependencies }) => {
  const dependencyReducer = (soFar, [name, value]) => {
    const { form, invalidFields } = soFar;

    if (Array.isArray(value)) {
      return Object.entries(
        prefixKeys(flattenArrayOfObjectsIntoPositionedObject(value), `${name}.`)
      ).reduce(dependencyReducer, soFar);
    }

    const relevantFieldGetter =
      getNestedPropertyValue(
        dependencies,
        getNestedPropertyKeyDescriptor(name)
      ) || getTrue;
    const getIsRelevantField =
      typeof relevantFieldGetter === "function" ? relevantFieldGetter : getTrue;
    const isRelevantField = getIsRelevantField({
      name,
      value: getNestedPropertyValue(form, name),
      form
    });
    return isRelevantField
      ? { ...soFar, hasInvalidFields: invalidFields.length > 0 }
      : {
          ...updateObjectDeeply(soFar, { property: name, value: "" }),
          invalidFields: invalidFields.filter(
            (invalidField) => invalidField !== name
          ),
          hasInvalidFields: invalidFields.length > 1
        };
  };

  return dependencyReducer;
};

const makeValidationReducer = ({ validations }) => {
  const validationReducer = (soFar, [name, value]) => {
    const { form, invalidFields } = soFar;

    if (Array.isArray(value)) {
      return Object.entries(
        prefixKeys(flattenArrayOfObjectsIntoPositionedObject(value), `${name}.`)
      ).reduce(validationReducer, soFar);
    }

    const validFieldGetter = getNestedPropertyValue(
      validations,
      getNestedPropertyKeyDescriptor(name)
    );
    const getIsValidField =
      typeof validFieldGetter === "function" ? validFieldGetter : getTrue;
    const isValidField = getIsValidField({
      name,
      value: getNestedPropertyValue(form, name),
      form
    });
    return isValidField
      ? { ...soFar, hasInvalidFields: invalidFields.length > 0 }
      : {
          ...soFar,
          invalidFields: [...invalidFields, name],
          hasInvalidFields: true
        };
  };

  return validationReducer;
};
