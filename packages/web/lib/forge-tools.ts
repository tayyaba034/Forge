import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export const FORGE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_scene_state',
    description:
      'Returns the full Unity scene hierarchy as JSON. Call this first to understand the project.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_object_components',
    description:
      'Returns all components and their serialized properties for a specific GameObject.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: {
          type: SchemaType.STRING,
          description: 'e.g. "Player" or "World/Enemy"',
        },
      },
      required: ['gameObjectPath'],
    },
  },
  {
    name: 'create_script',
    description:
      'Creates a new C# MonoBehaviour script and triggers compilation. Returns compile errors if any.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fileName: {
          type: SchemaType.STRING,
          description: 'Class name without .cs extension',
        },
        code: {
          type: SchemaType.STRING,
          description: 'Full C# source code',
        },
      },
      required: ['fileName', 'code'],
    },
  },
  {
    name: 'edit_script',
    description: 'Edits an existing C# script and triggers recompilation. Prefer code for a full replacement; diff is accepted by the bridge as replacement text for hackathon demos.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filePath: {
          type: SchemaType.STRING,
          description: 'Path relative to the Unity project root, e.g. "Assets/Scripts/Player.cs"',
        },
        code: {
          type: SchemaType.STRING,
          description: 'The new full C# source code to write to the file',
        },
        diff: {
          type: SchemaType.STRING,
          description: 'Optional patch/diff text when full source is not available',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_compile_errors',
    description: 'Returns current Unity compilation errors.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'set_component_property',
    description: 'Sets a field on a component attached to a GameObject.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
        componentType: {
          type: SchemaType.STRING,
          description: 'e.g. "HealthSystem"',
        },
        property: { type: SchemaType.STRING },
        value: {
          type: SchemaType.STRING,
          description: 'Value as a string; bridge will cast to correct type',
        },
      },
      required: ['gameObjectPath', 'componentType', 'property', 'value'],
    },
  },
  {
    name: 'enter_play_mode',
    description: 'Enters Unity play mode to test the project.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'exit_play_mode',
    description: 'Exits Unity play mode.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
];
