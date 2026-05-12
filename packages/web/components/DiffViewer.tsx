'use client';

import ReactDiffViewer from 'react-diff-viewer-continued';

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
  fileName: string;
}

export default function DiffViewer({ oldCode, newCode, fileName }: DiffViewerProps) {
  return (
    <div className="mt-2 border border-zinc-800 rounded-lg overflow-hidden bg-[#0d0d0f]">
      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 text-xs font-mono text-zinc-400 flex items-center gap-2">
        <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {fileName}
      </div>
      <div className="max-h-[400px] overflow-auto custom-scrollbar text-sm">
        <ReactDiffViewer
          oldValue={oldCode}
          newValue={newCode}
          splitView={false}
          useDarkTheme={true}
          styles={{
            variables: {
              dark: {
                diffViewerBackground: '#0d0d0f',
                diffViewerTitleBackground: '#161618',
                diffViewerColor: '#a1a1aa',
                addedBackground: '#064e3b',
                addedColor: '#34d399',
                removedBackground: '#7f1d1d',
                removedColor: '#f87171',
                wordAddedBackground: '#065f46',
                wordRemovedBackground: '#991b1b',
                emptyLineBackground: '#0d0d0f',
              }
            },
            line: {
              fontSize: '12px',
            }
          }}
        />
      </div>
    </div>
  );
}
