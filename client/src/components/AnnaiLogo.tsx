type AnnaiLogoProps = {
  className?: string;
  title?: string;
};

export function AnnaiLogo({ className, title = "Annai" }: AnnaiLogoProps) {
  return (
    <img
      src="/brand/annai-logo.png?v=20260314e"
      alt={title}
      className={`${className ?? ""} object-contain`}
      draggable={false}
    />
  );
}
