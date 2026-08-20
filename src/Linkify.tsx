// @ts-nocheck
import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

export default function Linkify({ text }: { text: string }) {
  if (!text) return null;
  const partes = String(text).split(URL_REGEX);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {parte}
          </a>
        ) : parte
      )}
    </>
  );
}
