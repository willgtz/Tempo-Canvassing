"use client";

import { Fragment } from "react";

// http(s):// links and bare www. links.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Punctuation that usually ends the sentence, not the link.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

// Renders plain text (like a note) with any links in it clickable,
// opening in a new tab. Everything else stays plain text.
export function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    // Keep a closing paren that belongs to the link, e.g. wiki/Foo_(bar).
    if (trailing.startsWith(")") && url.includes("(")) url = url.slice(0, url.length - trailing.length + 1);
    else if (trailing) url = url.slice(0, -trailing.length);
    if (!url) continue;

    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="break-all text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {url}
      </a>
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <Fragment>{parts}</Fragment>;
}
