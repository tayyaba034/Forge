'use client';

export type SceneNode = {
  name: string;
  path: string;
  active: boolean;
  components?: string[];
  children?: SceneNode[];
};

export type SceneState = {
  sceneName: string;
  objects?: SceneNode[];
};

export default function SceneTree({ sceneState }: { sceneState: SceneState | null }) {
  if (!sceneState) {
    return (
      <div className="text-zinc-600 text-sm flex flex-col items-center justify-center h-40 text-center px-4">
        <svg className="w-8 h-8 mb-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p>Scene not loaded</p>
        <p className="text-xs mt-1">FORGE will read the scene state automatically.</p>
      </div>
    );
  }

  return (
    <div className="text-sm font-mono whitespace-nowrap">
      <div className="text-zinc-300 font-bold mb-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        {sceneState.sceneName}
      </div>
      <div className="pl-2 border-l border-zinc-800 ml-2">
        {sceneState.objects?.map((obj) => (
          <GameObjectNode key={obj.path} node={obj} depth={0} />
        ))}
      </div>
    </div>
  );
}

function GameObjectNode({ node, depth }: { node: SceneNode; depth: number }) {
  const componentCount = node.components?.length ?? 0;
  const children = node.children ?? [];

  return (
    <div className="mt-1">
      <div className={`flex items-center gap-1.5 ${node.active ? 'text-zinc-300' : 'text-zinc-600'}`}>
        <span className="text-zinc-500 text-xs">└─</span>
        <svg className={`w-3.5 h-3.5 ${node.active ? 'text-zinc-400' : 'text-zinc-700'}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2l6 3.5v7L8 16l-6-3.5v-7L8 2zm0 1.5L3.5 6 8 8.5 12.5 6 8 3.5zm-5 4v5l4.5 2.5v-5L3 7.5zm10 0l-4.5 2.5v5L13 12.5v-5z" />
        </svg>
        {node.name}
        {componentCount > 1 && (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400">
            {componentCount - 1} comps
          </span>
        )}
      </div>
      {children.length > 0 && (
        <div className="pl-4 border-l border-zinc-800 ml-2">
          {children.map((child) => (
            <GameObjectNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
