'use client';

import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('csharp', csharp);

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
  fileName: string;
}

type DiffLine = {
  marker: '+' | '-' | ' ';
  value: string;
};

function buildLineDiff(oldCode: string, newCode: string): DiffLine[] {
  const oldLines = oldCode ? oldCode.split('\n') : [];
  const newLines = newCode ? newCode.split('\n') : [];

  if (oldLines.length === 0) {
    return newLines.map((value) => ({ marker: '+', value }));
  }

  const max = Math.max(oldLines.length, newLines.length);
  const lines: DiffLine[] = [];

  for (let index = 0; index < max; index++) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];

    if (oldLine === newLine) {
      lines.push({ marker: ' ', value: newLine ?? '' });
    } else {
      if (oldLine !== undefined) lines.push({ marker: '-', value: oldLine });
      if (newLine !== undefined) lines.push({ marker: '+', value: newLine });
    }
  }

  return lines;
}

function highlightCSharp(line: string) {
  return hljs.highlight(line || ' ', { language: 'csharp', ignoreIllegals: true }).value;
}

export default function DiffViewer({ oldCode, newCode, fileName }: DiffViewerProps) {
  const lines = buildLineDiff(oldCode, newCode);

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-800 bg-[#0d0d0f]">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-400">
        <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {fileName}
      </div>
      <pre className="custom-scrollbar max-h-[400px] overflow-auto bg-[#0d0d0f] p-0 text-xs leading-5">
        <code className="block min-w-full py-2 font-mono">
          {lines.map((line, index) => {
            const colorClass =
              line.marker === '+'
                ? 'bg-emerald-950/55 text-emerald-100'
                : line.marker === '-'
                  ? 'bg-red-950/55 text-red-100'
                  : 'bg-transparent text-zinc-400';

            return (
              <span key={`${index}-${line.marker}`} className={`block px-3 ${colorClass}`}>
                <span
                  className={`mr-3 inline-block w-4 select-none ${
                    line.marker === '+' ? 'text-emerald-400' : line.marker === '-' ? 'text-red-400' : 'text-zinc-600'
                  }`}
                >
                  {line.marker}
                </span>
                <span dangerouslySetInnerHTML={{ __html: highlightCSharp(line.value) }} />
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
