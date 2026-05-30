import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

const CONTROL =
  'w-full min-h-tap rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 ' +
  'shadow-sm transition-colors focus:border-clinical-600 focus:outline-none focus:ring-2 ' +
  'focus:ring-clinical-600/30 disabled:bg-gray-50 disabled:text-gray-500';

interface FieldShellProps {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

function FieldShell({ label, htmlFor, error, hint, required, children }: FieldShellProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-priority-p1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-priority-p1">{error}</p>}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
}

export function TextField({ id, name, label, error, hint, required, className, ...rest }: TextFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, error && 'border-priority-p1', className)}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
}

export function SelectField({
  id,
  name,
  label,
  error,
  hint,
  required,
  options,
  placeholder,
  className,
  ...rest
}: SelectFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <select
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, error && 'border-priority-p1', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
