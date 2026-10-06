import { optionsWithCurrent } from "../lib/images";
import { useStudio } from "../store";
import type { InputField } from "../types";
import { DropImage } from "./DropImage";
import { SelectInput, TextArea, TextInput } from "./ui";

export type FormValues = Record<string, string>;

export function defaultsFor(fields: InputField[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (field.default == null) values[field.key] = "";
    else values[field.key] = String(field.default);
  }
  return values;
}

export function visibleFields(fields: InputField[], values: FormValues): InputField[] {
  return fields.filter((field) => {
    if (!field.show_when) return true;
    return Object.entries(field.show_when).every(([key, expected]) => (values[key] ?? "") === expected);
  });
}

export function valuesToInputs(fields: InputField[], values: FormValues): Record<string, string | number> {
  const inputs: Record<string, string | number> = {};
  for (const field of visibleFields(fields, values)) {
    const raw = values[field.key] ?? "";
    if (field.type === "number") inputs[field.key] = raw === "" ? Number(field.default ?? 0) : Number(raw);
    else inputs[field.key] = raw;
  }
  return inputs;
}

export function WorkflowForm({
  fields,
  values,
  images,
  onChange,
  onImageFile,
}: {
  fields: InputField[];
  values: FormValues;
  images: { value: string; label: string }[];
  onChange: (key: string, value: string) => void;
  onImageFile?: (file: File) => void;
}) {
  const models = useStudio((state) => state.models);
  const shown = visibleFields(fields, values).filter((field) => field.key !== "prompt");
  return (
    <div className="grid grid-cols-2 gap-3">
      {shown.map((field) => {
        const wide = field.key.includes("prompt") || field.type === "image" || field.key === "model" || field.key === "lora";
        const catalog = field.key === "model" ? models?.checkpoints ?? [] : field.key === "lora" ? models?.loras ?? [] : [];
        const current = values[field.key] ?? "";
        return (
          <label key={field.key} className={`block text-xs text-mist ${wide ? "col-span-2" : ""}`}>
            <span className="mb-1 block">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.type === "string" && field.key.includes("prompt") ? (
              <TextArea rows={2} value={current} onChange={(event) => onChange(field.key, event.target.value)} />
            ) : null}
            {field.type === "string" && !field.key.includes("prompt") && field.key !== "model" && field.key !== "lora" ? (
              <TextInput value={current} onChange={(event) => onChange(field.key, event.target.value)} />
            ) : null}
            {field.key === "model" || field.key === "lora" ? (
              <SelectInput value={current} onChange={(event) => onChange(field.key, event.target.value)}>
                <option value="">{field.key === "lora" ? "None" : "Use the Settings checkpoint"}</option>
                {optionsWithCurrent(catalog, current)
                  .filter((option) => option !== "")
                  .map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
              </SelectInput>
            ) : null}
            {field.type === "number" ? (
              <TextInput
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={current}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            ) : null}
            {field.type === "select" ? (
              <SelectInput value={current} onChange={(event) => onChange(field.key, event.target.value)}>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            ) : null}
            {field.type === "image" ? (
              <div className="grid gap-2">
                <SelectInput value={current} onChange={(event) => onChange(field.key, event.target.value)}>
                  <option value="">Choose an image</option>
                  {images.map((image) => (
                    <option key={image.value} value={image.value}>
                      {image.label}
                    </option>
                  ))}
                </SelectInput>
                {onImageFile ? <DropImage label="Drop a source image, or choose a file" onFile={onImageFile} /> : null}
              </div>
            ) : null}
            {field.help ? <span className="mt-1 block text-[11px] text-mist/80">{field.help}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
