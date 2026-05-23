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
    name: 'create_gameobject',
    description:
      'Creates a new GameObject in the active Unity scene. Use this when the user wants a new object built from scratch.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: 'GameObject name, such as Player or EnemySpawner',
        },
        parentPath: {
          type: SchemaType.STRING,
          description: 'Optional parent path, e.g. World/Enemies',
        },
        primitiveType: {
          type: SchemaType.STRING,
          description: 'Optional primitive type like Cube, Sphere, Capsule, or Empty',
        },
        position: {
          type: SchemaType.OBJECT,
          properties: {
            x: { type: SchemaType.NUMBER },
            y: { type: SchemaType.NUMBER },
            z: { type: SchemaType.NUMBER },
          },
        },
        active: { type: SchemaType.BOOLEAN },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_gameobject',
    description: 'Deletes a GameObject from the active Unity scene.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
      },
      required: ['gameObjectPath'],
    },
  },
  {
    name: 'duplicate_gameobject',
    description: 'Duplicates a GameObject in the active Unity scene.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
        name: { type: SchemaType.STRING },
        parentPath: { type: SchemaType.STRING },
        position: {
          type: SchemaType.OBJECT,
          properties: {
            x: { type: SchemaType.NUMBER },
            y: { type: SchemaType.NUMBER },
            z: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ['gameObjectPath'],
    },
  },
  {
    name: 'rename_gameobject',
    description: 'Renames a GameObject in the active Unity scene.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
        name: { type: SchemaType.STRING },
      },
      required: ['gameObjectPath', 'name'],
    },
  },
  {
    name: 'save_as_prefab',
    description: 'Saves a GameObject as a prefab asset.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
        assetPath: { type: SchemaType.STRING },
      },
      required: ['gameObjectPath', 'assetPath'],
    },
  },
  {
    name: 'instantiate_prefab',
    description: 'Instantiates a prefab asset into the active Unity scene.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        assetPath: { type: SchemaType.STRING },
        name: { type: SchemaType.STRING },
        parentPath: { type: SchemaType.STRING },
        position: {
          type: SchemaType.OBJECT,
          properties: {
            x: { type: SchemaType.NUMBER },
            y: { type: SchemaType.NUMBER },
            z: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ['assetPath'],
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
