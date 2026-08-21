/**
 * FilterSection — editorial section label + content wrapper.
 *
 * The label is a plain span with an id so a filter group can reference it via
 * aria-labelledby. This preserves the archive-instrument visual language of the
 * original panel (10px tracked uppercase micro-label) while making group labels
 * programmatically associated for assistive technology.
 */

export const FILTER_SECTION_LABEL_CLASS =
  "text-[10px] font-sans tracking-widest uppercase text-[#686e7b] select-none whitespace-nowrap";

export function FilterSection({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <span id={id} className={FILTER_SECTION_LABEL_CLASS}>
        {label}
      </span>
      {children}
    </div>
  );
}
