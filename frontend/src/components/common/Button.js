const VARIANT_STYLES = {
  primary: 'bg-secondary-500 text-white hover:bg-secondary-600 border-transparent',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 border-transparent',
};

const SIZE_STYLES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex min-w-0 items-center justify-center rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_STYLES[variant] || VARIANT_STYLES.primary} ${SIZE_STYLES[size] || SIZE_STYLES.md} ${className}`}
      {...props}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}
