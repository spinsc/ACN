// Ícone SVG do Material Design Icons (@mdi/js — importar só os usados).
// Uso: <Icone path={mdiMagnify} size={18} />. Herda a cor do texto.
import React from 'react';

export default function Icone({ path, size = 18, title, style, className }:
  { path: string; size?: number; title?: string; style?: React.CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      style={{ flexShrink: 0, display: 'block', ...style }}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={path} fill="currentColor" />
    </svg>
  );
}
