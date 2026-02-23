export default function Input({
  label,
  error = '',
  helperText = '',
  className = '',
  id,
  ...props
}) {
  const inputId = id || props.name || undefined;

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${error ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-secondary-500'} ${className}`}
        {...props}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="mt-1 text-xs text-gray-500">{helperText}</p> : null}
    </div>
  );
}
