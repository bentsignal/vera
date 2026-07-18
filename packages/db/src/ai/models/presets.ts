import { embeddingModels } from "./embed";
import { languageModels } from "./language";
import { transcriptionModels } from "./voice";

export const modelPresets = {
  default: languageModels["gemini-3.5-flash"],
  classifier: languageModels["gemini-2.5-flash-lite"],
  followUp: languageModels["gemini-3.5-flash"],
  titleGenerator: languageModels["gemini-2.5-flash-lite"],
  transcription: transcriptionModels["scribe-v2"],
  search: languageModels.sonar,
  embedding: embeddingModels["text-embedding-3-small"],
  code: languageModels["gpt-5.2"],
};
