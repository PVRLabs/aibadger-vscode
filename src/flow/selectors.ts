import "../shared/selectorPrimitives";

export type ParsedSelector = BadgerSelectorPrimitives.ParsedSelector;
export type ValidateSelectorsResult =
  BadgerSelectorPrimitives.ValidationResult;
export type ValidateSelectorsSuccess = Extract<
  ValidateSelectorsResult,
  { ok: true }
>;
export type ValidateSelectorsFailure = Extract<
  ValidateSelectorsResult,
  { ok: false }
>;

const primitives = (
  globalThis as typeof globalThis & {
    BadgerSelectorPrimitives: typeof BadgerSelectorPrimitives;
  }
).BadgerSelectorPrimitives;

export const hasSelectorLikeContent = primitives.hasSelectorLikeContent;
export const validateSelectors = primitives.validateSelectors;
