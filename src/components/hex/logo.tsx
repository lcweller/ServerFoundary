export function HexLogo({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 2V12M12 12L21 7M12 12L3 7M12 12V22"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function HexWordmark({ size = 18 }: { size?: number }) {
  return (
    <div className="inline-flex items-center gap-2 leading-none">
      <HexLogo size={size + 4} />
      <span
        className="font-sans font-semibold"
        style={{ fontSize: size, letterSpacing: "-0.02em" }}
      >
        serverforge
      </span>
    </div>
  );
}
