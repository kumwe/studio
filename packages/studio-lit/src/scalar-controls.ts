import { html, nothing, type TemplateResult } from 'lit';
import type { JsonSchema, JsonValue, LocalName } from '@kumwe/studio-protocol';

/** In-process value port. The host remains authoritative for every durable edit. */
export interface StudioEntryValueAdapter {
  read(path: readonly LocalName[]): JsonValue | undefined;
  write(path: readonly LocalName[], value: JsonValue): void;
}

export interface StudioScalarControl {
  readonly label: string;
  readonly key: string;
  readonly readOnly: boolean;
  readonly schema: Readonly<JsonSchema>;
  readonly value: unknown;
  readonly multiline?: boolean;
  readonly onChange: (value: JsonValue) => void;
}

/** Only scalar shapes have an ordinary input; complex values keep their declared adapter. */
export function isScalarControlSchema(schema: unknown): schema is JsonSchema {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const shape = schema as JsonSchema;
  return (
    (typeof shape.type === 'string' &&
      ['string', 'boolean', 'number', 'integer'].includes(shape.type)) ||
    (Array.isArray(shape.enum) &&
      shape.enum.length > 0 &&
      shape.enum.length <= 200 &&
      shape.enum.every(
        (value) =>
          value === null ||
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)),
      ))
  );
}

/** Native, labeled controls dispatch typed values, never user-entered JSON strings. */
export function renderScalarControl(control: StudioScalarControl): TemplateResult {
  const { label, key, schema, value, readOnly, onChange } = control;
  const choices = Array.isArray(schema.enum) ? schema.enum.filter(isScalarValue) : undefined;
  if (choices !== undefined) {
    return html`<label class="scalar-control" data-scalar-key=${key}>
      <span>${label}</span>
      <select
        ?disabled=${readOnly}
        @change=${(event: Event): void => {
          const input = event.currentTarget;
          if (!(input instanceof HTMLSelectElement) || readOnly) return;
          const choice = choices[Number(input.value)];
          if (choice !== undefined) onChange(choice);
        }}
      >
        <option value="" disabled .selected=${!choices.some((choice) => choice === value)}>
          —
        </option>
        ${choices.map(
          (choice, index) =>
            html`<option value=${String(index)} .selected=${choice === value}>
              ${String(choice)}
            </option>`,
        )}
      </select>
    </label>`;
  }
  if (schema.type === 'boolean') {
    return html`<label class="scalar-control scalar-checkbox" data-scalar-key=${key}>
      <input
        type="checkbox"
        .checked=${value === true}
        ?disabled=${readOnly}
        @change=${(event: Event): void => {
          if (event.currentTarget instanceof HTMLInputElement && !readOnly)
            onChange(event.currentTarget.checked);
        }}
      />
      <span>${label}</span>
    </label>`;
  }
  const acceptText = (event: Event): void => {
    const input = event.currentTarget;
    if (readOnly || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement))
      return;
    const valid = input.checkValidity();
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid) return;
    if (schema.type === 'number' || schema.type === 'integer') {
      if (input.value.trim() === '') return;
      const number = Number(input.value);
      if (Number.isFinite(number) && (schema.type !== 'integer' || Number.isSafeInteger(number)))
        onChange(number);
    } else onChange(input.value);
  };
  if (control.multiline === true) {
    return html`<label class="scalar-control" data-scalar-key=${key}>
      <span>${label}</span>
      <textarea
        rows="4"
        .value=${typeof value === 'string' ? value : ''}
        ?disabled=${readOnly}
        minlength=${numberAttribute(schema.minLength)}
        maxlength=${numberAttribute(schema.maxLength)}
        @input=${acceptText}
      ></textarea>
    </label>`;
  }
  const number = schema.type === 'integer' || schema.type === 'number';
  return html`<label class="scalar-control" data-scalar-key=${key}>
    <span>${label}</span>
    <input
      type=${number ? 'number' : 'text'}
      .value=${typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      ?disabled=${readOnly}
      step=${number ? (schema.type === 'integer' ? '1' : 'any') : nothing}
      min=${numberAttribute(schema.minimum)}
      max=${numberAttribute(schema.maximum)}
      minlength=${numberAttribute(schema.minLength)}
      maxlength=${numberAttribute(schema.maxLength)}
      @input=${acceptText}
    />
  </label>`;
}

function numberAttribute(value: unknown): string | typeof nothing {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : nothing;
}

function isScalarValue(value: JsonValue): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
