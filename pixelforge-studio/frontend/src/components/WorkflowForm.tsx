import type { InputField } from "../types";
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
}: {
  fields: InputField[];
  values: FormValues;
  images: { value: string; label: string }[];
  onChange: (key: string, value: string) => void;
}) {
  const shown = visibleFields(fields, values);
  return (
    <div className="grid grid-cols-2 gap-3">
      {shown.map((field) => {
        const wide = field.key.includes("prompt") || field.type === "image";
        return (
          <label key={field.key} className={`block text-xs text-mist ${wide ? "col-span-2" : ""}`}>
            <span className="mb-1 block">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.type === "string" && field.key.includes("prompt") ? (
              <TextArea rows={field.key === "prompt" ? 4 : 2} value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)} />
            ) : null}
            {field.type === "string" && !field.key.includes("prompt") ? (
              <TextInput value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)} />
            ) : null}
            {field.type === "number" ? (
              <TextInput
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            ) : null}
            {field.type === "select" ? (
              <SelectInput value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)}>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            ) : null}
            {field.type === "image" ? (
              <SelectInput value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)}>
                <option value="">Choose an image</option>
                {images.map((image) => (
                  <option key={image.value} value={image.value}>
                    {image.label}
                  </option>
                ))}
              </SelectInput>
            ) : null}
            {field.help ? <span className="mt-1 block text-[11px] text-mist/80">{field.help}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
