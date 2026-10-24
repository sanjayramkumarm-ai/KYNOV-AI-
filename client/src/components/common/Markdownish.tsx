import type { ReactNode } from 'react';

/**
 * Minimal, dependency-free renderer for assistant markdown-ish output.
 * Builds React elements only (no dangerouslySetInnerHTML) so document-emitted
 * text can never inject HTML/JS into the app.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\b_[^_]+_\b|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('_') || token.startsWith('*')) nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safe = /^(https?:\/\/|\/)/i.test(href);
        nodes.push(
          safe ? (
            <a key={key} href={href} target="_blank" rel="noreferrer noopener">
              {label}
            </a>
          ) : (
            <span key={key}>{label}</span>
          ),
        );
      } else nodes.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdownish({ content }: { content: string }) {
  const lines = (content ?? '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={key}>
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, '');
    const key = `l${index}`;

    if (!line.trim()) {
      flushList(`list-${index}`);
      return;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);

    if (bullet) {
      if (!list || list.ordered) {
        flushList(`list-${index}`);
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      return;
    }
    if (numbered) {
      if (!list || !list.ordered) {
        flushList(`list-${index}`);
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      return;
    }

    flushList(`list-${index}`);

    if (heading) {
      const level = heading[1].length;
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      blocks.push(<Tag key={key}>{renderInline(heading[2], key)}</Tag>);
      return;
    }
    if (/^\s*>\s?/.test(line)) {
      blocks.push(
        <blockquote key={key} className="my-2 border-l-2 border-cyan-400/40 pl-3 text-sm italic text-muted">
          {renderInline(line.replace(/^\s*>\s?/, ''), key)}
        </blockquote>,
      );
      return;
    }
    blocks.push(<p key={key}>{renderInline(line, key)}</p>);
  });

  flushList('list-final');

  return <div className="prose-kynov space-y-1.5">{blocks}</div>;
}
