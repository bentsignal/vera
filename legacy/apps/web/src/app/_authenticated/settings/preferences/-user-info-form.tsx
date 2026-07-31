import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { toast } from "sonner";

import type { PublicLanguageModel } from "@acme/db/models/types";
import { api } from "@acme/db/api";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";

interface UserInfo {
  name?: string;
  location?: string;
  language?: string;
  notes?: string;
  model?: string;
}

function groupModelsByProvider(models: Record<string, PublicLanguageModel>) {
  const providerToModels = new Map<string, [string, PublicLanguageModel][]>();
  for (const [modelId, modelData] of Object.entries(models)) {
    const arr = providerToModels.get(modelData.provider) ?? [];
    arr.push([modelId, modelData]);
    providerToModels.set(modelData.provider, arr);
  }
  const sortedProviders = Array.from(providerToModels.keys()).sort((a, b) =>
    a.localeCompare(b),
  );
  return sortedProviders.map((provider) => {
    const items = (providerToModels.get(provider) ?? []).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
    return { provider, items } as const;
  });
}

function isUnchanged(
  lastSaved: UserInfo,
  current: {
    name?: string;
    location?: string;
    language?: string;
    notes?: string;
    model?: string;
  },
  showModelSelector: boolean,
) {
  return (
    current.name === lastSaved.name &&
    current.location === lastSaved.location &&
    current.language === lastSaved.language &&
    current.notes === lastSaved.notes &&
    (showModelSelector ? current.model === lastSaved.model : true)
  );
}

function useSaveUserInfo() {
  return useMutation({
    mutationFn: useConvexMutation(api.user.info.update),
    onSuccess: () => {
      toast.success("Preferences updated");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to update preferences");
    },
  });
}

function ModelSelector({
  model,
  onModelChange,
  models,
}: {
  model?: string;
  onModelChange: (value: string) => void;
  models: Record<string, PublicLanguageModel>;
}) {
  const groupedModels = groupModelsByProvider(models);

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">
        What model do you want to use?
      </label>
      <Select value={model} onValueChange={onModelChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {groupedModels.map(({ provider, items }) => (
            <SelectGroup key={provider} className="mb-2">
              <SelectLabel>{provider}</SelectLabel>
              {items.map(([modelId, modelData]) => (
                <SelectItem key={modelId} value={modelId}>
                  {modelData.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function UserInfoForm({
  userInfo,
  showModelSelector,
  models,
}: {
  userInfo: UserInfo | null;
  showModelSelector: boolean;
  models: Record<string, PublicLanguageModel>;
}) {
  const { mutate: save } = useSaveUserInfo();

  const [name, setName] = useState(userInfo?.name);
  const [location, setLocation] = useState(userInfo?.location);
  const [language, setLanguage] = useState(userInfo?.language);
  const [notes, setNotes] = useState(userInfo?.notes);
  const [model, setModel] = useState(userInfo?.model);

  const [lastSavedUserInfo, setLastSavedUserInfo] = useState<UserInfo | null>(
    userInfo,
  );

  const disabled =
    lastSavedUserInfo !== null &&
    isUnchanged(
      lastSavedUserInfo,
      { name, location, language, notes, model },
      showModelSelector,
    );

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = {
          name: name?.trim(),
          location: location?.trim(),
          language: language?.trim(),
          notes: notes?.trim(),
          model: showModelSelector ? model : undefined,
        };
        save(trimmed);
        setLastSavedUserInfo(trimmed);
      }}
    >
      <div className="grid gap-2">
        <label className="text-sm font-medium">What should we call you?</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={100}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">Where are you from?</label>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Enter your location"
          maxLength={100}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">
          What language should we respond in?
        </label>
        <Input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="English, Spanish, etc."
          maxLength={100}
        />
      </div>
      {showModelSelector && (
        <ModelSelector model={model} onModelChange={setModel} models={models} />
      )}
      <div className="grid gap-2">
        <label className="text-sm font-medium">
          Anything else we should know about you?
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Interests, values, or anything else you'd like to tell us"
          rows={4}
          className="bg-input/30 border-border rounded-lg border-1 p-2"
          maxLength={1000}
        />
      </div>
      <div>
        <Button type="submit" disabled={disabled}>
          Save
        </Button>
      </div>
    </form>
  );
}
