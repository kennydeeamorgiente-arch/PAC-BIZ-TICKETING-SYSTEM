export default function LoadingState({
  label = 'Loading...',
  type = 'section',
  className = '',
}) {
  const spinner = (
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
  );

  if (type === 'fullscreen') {
    return (
      <div className={`flex min-h-screen items-center justify-center bg-gray-50 px-4 ${className}`}>
        <div className="text-center">
          <div className="mx-auto">{spinner}</div>
          <p className="mt-3 text-sm text-gray-600">{label}</p>
        </div>
      </div>
    );
  }

  if (type === 'inline') {
    return (
      <div className={`flex h-full min-h-[120px] items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="mx-auto">{spinner}</div>
          <p className="mt-2 text-xs text-gray-500">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-8 text-center ${className}`}>
      <div className="mx-auto">{spinner}</div>
      <p className="mt-3 text-sm text-gray-600">{label}</p>
    </div>
  );
}

