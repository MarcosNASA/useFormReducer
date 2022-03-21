import * as React from "react";
import {
  callAll,
  identity,
  updateObjectDeeply,
  prefixKeys,
  getNestedPropertyValue,
  pipe,
  noop,
  flattenArrayOfObjectsIntoPositionedObject,
  getNestedPropertyKeyDescriptor,
  truePredicate
} from "./helpers";

export const VALIDATION_MODE = {
  onChange: "onChange",
  onSubmit: "onSubmit",
  onBlur: "onBlur"
};

export const useFormReducer = ({
  initialValue,
  validations = {},
  dependencies = {},
  mode = VALIDATION_MODE.onChange,
  revalidationMode = VALIDATION_MODE.onSubmit,
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
  const { form, dirtyFields, invalidFields, touchedFields } = formState;
  const formControlsRefs = React.useRef([]);

  const validateField = React.useMemo(
    () =>
      makeFieldValidator({
        dependencies:
          typeof dependencies === "function"
            ? dependencies(form)
            : dependencies,
        validations:
          typeof validations === "function" ? validations(form) : validations
      }),
    [form, dependencies, validations]
  );

  const reducers = React.useMemo(
    () =>
      customReducer || [
        ...(Object.keys(
          typeof dependencies === "function" ? dependencies(form) : dependencies
        ).length > 0
          ? [
              makeDependencyReducer({
                dependencies:
                  typeof dependencies === "function"
                    ? dependencies(form)
                    : dependencies
              })
            ]
          : []),
        ...(Object.keys(
          typeof validations === "function" ? validations(form) : validations
        ).length > 0
          ? [
              makeValidationReducer({
                validations:
                  typeof validations === "function"
                    ? validations(form)
                    : validations
              })
            ]
          : [])
      ],
    [form, customReducer, dependencies, validations]
  );

  const setForm = React.useCallback((newForm) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      form: {
        ...currentFormState.form,
        ...newForm
      }
    }));
  }, []);

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
    const shouldRevalidate = revalidationMode === VALIDATION_MODE.onChange;
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
    if (![mode, revalidationMode].includes(VALIDATION_MODE.onBlur)) return;

    const {
      form: updatedForm,
      invalidFields: updatedInvalidFields
    } = validateField(formState, { name });

    setFormState((currentFormState) => ({
      ...currentFormState,
      form: updatedForm,
      invalidFields: updatedInvalidFields,
      hasInvalidFields: updatedInvalidFields.length > 0
    }));
  };

  const handleFocus = ({ target: { name } }) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      touchedFields: [...new Set([...touchedFields, name])]
    }));
  };

  const register = ({
    name: customName,
    onBlur: customHandleBlur,
    onChange: customHandleChange = identity,
    onFocus: customHandleFocus,
    valueGetter = identity,
    noRef = false,
    ...otherProps
  } = {}) => {
    const name = Array.isArray(customName) ? customName.join(".") : customName;
    return {
      ...otherProps,
      name,
      value: valueGetter(getNestedPropertyValue(form, name)) ?? "",
      onBlur: callAll(customHandleBlur, handleBlur),
      onChange: pipe(customHandleChange, handleChange),
      onFocus: callAll(customHandleFocus, handleFocus),
      ...(!noRef && {
        ref: (element) => {
          formControlsRefs.current = {
            ...formControlsRefs.current,
            [name]: element
          };
        }
      })
    };
  };

  const unregister = (name, { form: newForm = form } = {}) => {
    setFormState({
      ...formState,
      form: { ...newForm },
      invalidFields: invalidFields.filter(
        (invalidField) => !invalidField.match(new RegExp(name, "ig"))
      ),
      touchedFields: touchedFields.filter(
        (invalidField) => !invalidField.match(new RegExp(name, "ig"))
      ),
      dirtyFields: dirtyFields.filter(
        (invalidField) => !invalidField.match(new RegExp(name, "ig"))
      )
    });
    formControlsRefs.current = Object.fromEntries(
      Object.entries(formControlsRefs).filter(
        ([formControlRefName]) => formControlRefName !== name
      )
    );
  };

  const clear = () => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      touchedFields: [],
      dirtyFields: [],
      invalidFields: []
    }));
  };

  const handleSubmit = (onValid = noop, onInvalid = noop) => (event) => {
    const shouldValidate = [mode, revalidationMode].includes(
      VALIDATION_MODE.onSubmit
    );
    const updatedFormState = shouldValidate ? revalidate(formState) : formState;
    setFormState(updatedFormState);

    const {
      hasInvalidFields: hasInvalidFieldsAfterRevalidation,
      form: updatedForm
    } = updatedFormState;
    initialValueRef.current = hasInvalidFieldsAfterRevalidation
      ? initialValueRef.current
      : updatedForm;
    const customHandleSubmit = hasInvalidFieldsAfterRevalidation
      ? onInvalid
      : onValid;
    customHandleSubmit(updatedFormState, { clear, revalidate, setFormState });

    event.preventDefault();
  };

  return [
    formState,
    {
      clear,
      formControlsRefs,
      handleSubmit,
      register,
      revalidate,
      setForm,
      setFormState,
      unregister
    }
  ];
};

const makeFieldValidator = ({ validations, dependencies }) => (
  formState,
  { name }
) => {
  const { form, invalidFields } = formState;

  const relevantFieldGetter =
    getNestedPropertyValue(
      dependencies,
      getNestedPropertyKeyDescriptor(name)
    ) || truePredicate;
  const getIsRelevantField =
    typeof relevantFieldGetter === "function"
      ? relevantFieldGetter
      : truePredicate;
  const isRelevantField = getIsRelevantField({
    name,
    value: getNestedPropertyValue(form, name),
    form
  });
  const newForm = isRelevantField
    ? form
    : updateObjectDeeply(form, {
        property: name,
        value: ""
      }); /* clears non-relevant fields */

  const validFieldGetter =
    getNestedPropertyValue(validations, getNestedPropertyKeyDescriptor(name)) ||
    truePredicate;
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
      ) || truePredicate;
    const getIsRelevantField =
      typeof relevantFieldGetter === "function"
        ? relevantFieldGetter
        : truePredicate;
    const isRelevantField = getIsRelevantField({
      name,
      value: getNestedPropertyValue(form, name),
      form
    });
    return isRelevantField
      ? { ...soFar, hasInvalidFields: invalidFields.length > 0 }
      : {
          ...soFar,
          form: updateObjectDeeply(form, { property: name, value: null }),
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
      typeof validFieldGetter === "function" ? validFieldGetter : truePredicate;
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

const getDirtyFields = ({ initial, current, field, dirtyFields }) =>
  Object.is(
    getNestedPropertyValue(initial, field),
    getNestedPropertyValue(current, field)
  )
    ? dirtyFields.filter((dirtyField) => dirtyField !== field)
    : [...new Set([...dirtyFields, field])];
