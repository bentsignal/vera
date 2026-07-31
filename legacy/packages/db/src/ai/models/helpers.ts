import type { PublicLanguageModel } from "./types";
import { languageModels } from "./language";
import { modelPresets } from "./presets";

export function getPublicLanguageModels() {
  return Object.fromEntries(
    Object.entries(languageModels)
      .filter(([, modelData]) => modelData.available)
      .map(([modelId, modelData]) => {
        const {
          model: _model,
          cost: _cost,
          available: _available,
          ...publicModel
        } = modelData;
        return [modelId, publicModel] satisfies [string, PublicLanguageModel];
      }),
  );
}

export function getModel(modelId?: string) {
  if (!modelId) {
    return modelPresets.default;
  }
  if (isLanguageModelKey(modelId) && languageModels[modelId].available) {
    return languageModels[modelId];
  }
  return modelPresets.default;
}

export function isLanguageModelKey(
  key: string | undefined,
): key is keyof typeof languageModels {
  return key !== undefined && key in languageModels;
}
