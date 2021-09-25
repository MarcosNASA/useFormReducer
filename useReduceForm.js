import { useMemo, useRef, useState } from "react";
import { callAll, compareShallowly, noop } from "./helpers";

export const VALIDATION_MODE = {
  onChange: "onChange",
  onSubmit: "onSubmit",
  onBlur: "onBlur"
};

const truePredicate = () => true;

export const useReduceForm = ({
  defaultValue,
  validations = {},
  dependencies = {},
  mode = VALIDATION_MODE.onChange,
  reValidateMode = VALIDATION_MODE.onChange,
  reducer: customReducer
}) => {
  const defaultValueRef = useRef(defaultValue);
  const [formState, setFormState] = useState({
    form: { ...defaultValue },
    dirtyFields: [],
    hasInvalidFields: false,
    invalidFields: [],
    touchedFields: []
  });
  const { touchedFields, form } = formState;

  const validateField = useMemo(
    () => makeFieldValidator({ validations, dependencies }),
    [validations, dependencies]
  );

  const reducers = customReducer || [
    makeDependencyReducer({ dependencies }),
    makeValidationReducer({ validations })
  ];

  const revalidate = (formState) => {
    return reduceForm({ ...formState, invalidFields: [] }, reducers);
  };

  const formSetter = (formState) => {
    const updatedDirtyFields = compareShallowly(
      defaultValueRef.current,
      selectForm(formState)
    );

    const shouldValidate = [mode, reValidateMode].includes(
      VALIDATION_MODE.onChange
    );

    const {
      form: updatedForm,
      invalidFields: updatedInvalidFields
    } = shouldValidate ? revalidate(formState) : formState;

    setFormState({
      ...formState,
      form: updatedForm,
      dirtyFields: updatedDirtyFields,
      ...(shouldValidate && {
        hasInvalidFields: updatedInvalidFields.length > 0,
        invalidFields: updatedInvalidFields
      })
    });
  };

  const handleFocus = ({ target: { name } }) => {
    setFormState({
      ...formState,
      touchedFields: [...new Set([...touchedFields, name])]
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

  const register = ({
    name,
    onBlur: customHandleBlur,
    onFocus: customHandleFocus,
    ...otherProps
  } = {}) => ({
    ...otherProps,
    name,
    value: form[name] ?? "",
    onBlur: callAll(customHandleBlur, handleBlur),
    onFocus: callAll(customHandleFocus, handleFocus)
  });

  const handleSubmit = (onValid = noop, onInvalid = noop) => {
    return (event) => {
      event.preventDefault();

      const shouldValidate = [mode, reValidateMode].includes(
        VALIDATION_MODE.onSubmit
      );

      const updatedFormState = shouldValidate
        ? revalidate(formState)
        : formState;
      shouldValidate && setFormState(updatedFormState);

      const { hasInvalidFields } = updatedFormState;
      const customHandleSubmit = hasInvalidFields ? onInvalid : onValid;
      customHandleSubmit(updatedFormState);
    };
  };

  return [formState, formSetter, { register, handleSubmit }];
};

const makeFieldValidator = ({ validations, dependencies }) => (
  formState,
  { name }
) => {
  const { form, invalidFields } = formState;

  const getIsRelevantField = dependencies[name] || truePredicate;
  const isRelevantField = getIsRelevantField(form);
  const newForm = isRelevantField
    ? form
    : {
        ...form,
        [name]: null
      }; /* clears non-relevant fields */

  const getIsValidField = validations[name] || truePredicate;
  const isValidField = isRelevantField ? getIsValidField(newForm) : true;
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
  (Array.isArray(reducers) ? reducers : [reducers]).reduce(
    (calculatedFormState, reducer) =>
      Object.entries(selectForm(formState)).reduce(
        reducer,
        calculatedFormState
      ),
    formState
  );

const selectForm = ({ form }) => form;

const makeDependencyReducer = ({ dependencies }) => {
  const dependencyReducer = (acc, [name]) => {
    const form = selectForm(acc);
    const getIsRelevantField = dependencies[name] || truePredicate;
    const isRelevantField = getIsRelevantField(form);
    const newState = isRelevantField
      ? acc
      : {
          ...acc,
          form: {
            ...form,
            [name]: null
          }
        };

    return newState;
  };

  return dependencyReducer;
};

const makeValidationReducer = ({ validations }) => {
  const validationReducer = (acc, [name]) => {
    const { form, invalidFields } = acc;

    const getIsValidField = validations[name] || truePredicate;
    const isValidField = getIsValidField(form);
    const newState = isValidField
      ? acc
      : { ...acc, invalidFields: [...invalidFields, name] };

    return newState;
  };

  return validationReducer;
};
