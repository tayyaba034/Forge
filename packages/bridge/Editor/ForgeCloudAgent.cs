using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine.Networking;

public static class ForgeCloudAgent
{
    const string BaseUrlPref = "FORGE_OLLAMA_BASE_URL";
    const string ModelPref = "FORGE_OLLAMA_MODEL";
    const string DefaultBaseUrl = "http://localhost:11434";
    const string DefaultModel = "qwen2.5-coder:3b";

    public static string GetApiKey()
    {
        return string.Empty;
    }

    public static void SetApiKey(string value)
    {
    }

    public static string GetBaseUrl()
    {
        var stored = EditorPrefs.GetString(BaseUrlPref, string.Empty);
        if (!string.IsNullOrWhiteSpace(stored)) return stored.Trim().TrimEnd('/');

        return (Environment.GetEnvironmentVariable("OLLAMA_BASE_URL") ?? DefaultBaseUrl).Trim().TrimEnd('/');
    }

    public static void SetBaseUrl(string value)
    {
        EditorPrefs.SetString(BaseUrlPref, value?.Trim().TrimEnd('/') ?? string.Empty);
    }

    public static string GetModel()
    {
        var stored = EditorPrefs.GetString(ModelPref, string.Empty);
        if (!string.IsNullOrWhiteSpace(stored)) return stored.Trim();

        return (Environment.GetEnvironmentVariable("OLLAMA_MODEL") ?? DefaultModel).Trim();
    }

    public static void SetModel(string value)
    {
        EditorPrefs.SetString(ModelPref, value?.Trim() ?? string.Empty);
    }

    public static bool HasApiKey() => true;

    public static async Task<string> RunAsync(string prompt, Action<string> log)
    {
        var baseUrl = GetBaseUrl();
        var model = GetModel();
        if (string.IsNullOrWhiteSpace(model))
            throw new InvalidOperationException("Set an Ollama model, for example qwen2.5-coder:3b or phi3:mini.");

        var messages = new List<Dictionary<string, object>>
        {
            MakeMessage("system", BuildSystemPrompt()),
            MakeMessage("user", prompt)
        };

        for (var iteration = 0; iteration < 12; iteration++)
        {
            var requestBody = new Dictionary<string, object>
            {
                ["model"] = model,
                ["messages"] = messages,
                ["tools"] = BuildOllamaTools(),
                ["stream"] = false,
                ["options"] = new Dictionary<string, object>
                {
                    ["temperature"] = 0.1
                }
            };

            var responseText = await PostJsonAsync($"{baseUrl}/api/chat", JsonConvert.SerializeObject(requestBody));
            var response = JObject.Parse(responseText);
            var message = response["message"] as JObject;
            if (message == null)
                throw new InvalidOperationException("Ollama returned no message.");

            messages.Add(message.ToObject<Dictionary<string, object>>());

            var content = message["content"]?.ToString();
            if (!string.IsNullOrWhiteSpace(content))
                log?.Invoke(content);

            var toolCalls = message["tool_calls"] as JArray;
            if (toolCalls == null || toolCalls.Count == 0)
                return content?.Trim() ?? string.Empty;

            foreach (var toolCall in toolCalls.OfType<JObject>())
            {
                var function = toolCall["function"] as JObject;
                var functionName = function?["name"]?.ToString();
                if (string.IsNullOrWhiteSpace(functionName))
                    continue;

                var args = ParseArguments(function["arguments"]);

                log?.Invoke($"Calling {functionName}...");
                var toolResult = ExecuteTool(functionName, args);
                log?.Invoke($"{functionName} completed.");

                messages.Add(new Dictionary<string, object>
                {
                    ["role"] = "tool",
                    ["name"] = functionName,
                    ["content"] = JsonConvert.SerializeObject(new Dictionary<string, object>
                    {
                        ["result"] = toolResult
                    })
                });

                if (functionName == "create_script" || functionName == "edit_script")
                {
                    log?.Invoke("Calling get_compile_errors...");
                    var compileErrors = ExecuteTool("get_compile_errors", new Dictionary<string, object>());
                    log?.Invoke("get_compile_errors completed.");
                    messages.Add(new Dictionary<string, object>
                    {
                        ["role"] = "tool",
                        ["name"] = "get_compile_errors",
                        ["content"] = JsonConvert.SerializeObject(new Dictionary<string, object>
                        {
                            ["result"] = compileErrors
                        })
                    });
                }
            }
        }

        return "Ollama agent stopped after the maximum number of tool iterations.";
    }

    static Dictionary<string, object> ParseArguments(JToken token)
    {
        if (token == null || token.Type == JTokenType.Null)
            return new Dictionary<string, object>();

        if (token.Type == JTokenType.String)
        {
            var raw = token.ToString();
            if (string.IsNullOrWhiteSpace(raw))
                return new Dictionary<string, object>();

            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(raw)
                    ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        return token.ToObject<Dictionary<string, object>>() ?? new Dictionary<string, object>();
    }

    static object ExecuteTool(string tool, Dictionary<string, object> args)
    {
        var responseJson = ForgeDispatcher.Dispatch(new ForgeCommand
        {
            id = Guid.NewGuid().ToString("N"),
            tool = tool,
            args = args,
        });

        var envelope = JObject.Parse(responseJson);
        if (!(envelope["ok"]?.Value<bool>() ?? false))
            throw new InvalidOperationException(envelope["error"]?.ToString() ?? $"Tool failed: {tool}");

        return envelope["result"]?.ToObject<object>();
    }

    static async Task<string> PostJsonAsync(string url, string jsonBody)
    {
        using var request = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST);
        var body = Encoding.UTF8.GetBytes(jsonBody);
        request.uploadHandler = new UploadHandlerRaw(body);
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.timeout = 180;

        var operation = request.SendWebRequest();
        while (!operation.isDone)
            await Task.Yield();

        if (request.result != UnityWebRequest.Result.Success)
            throw new InvalidOperationException($"Ollama request failed: {request.error}\n{request.downloadHandler?.text}");

        return request.downloadHandler.text;
    }

    static List<Dictionary<string, object>> BuildOllamaTools()
    {
        return BuildToolDeclarations()
            .Select(fn => new Dictionary<string, object>
            {
                ["type"] = "function",
                ["function"] = fn
            })
            .ToList();
    }

    static List<Dictionary<string, object>> BuildToolDeclarations()
    {
        return new List<Dictionary<string, object>>
        {
            Fn("get_scene_state", "Returns the full Unity scene hierarchy as JSON. Call this first to understand the project."),
            Fn("get_object_components", "Returns all components and their serialized properties for a specific GameObject.",
                new Dictionary<string, object> { ["gameObjectPath"] = Str("e.g. Player or World/Enemy") }, new [] { "gameObjectPath" }),
            Fn("create_gameobject", "Creates a new GameObject in the active Unity scene.",
                new Dictionary<string, object>
                {
                    ["name"] = Str("GameObject name, such as Player or EnemySpawner"),
                    ["parentPath"] = Str("Optional parent path"),
                    ["primitiveType"] = Str("Optional primitive type: Cube, Sphere, Capsule, Cylinder, Plane, or Empty"),
                    ["position"] = new Dictionary<string, object>
                    {
                        ["type"] = "object",
                        ["properties"] = new Dictionary<string, object>
                        {
                            ["x"] = new Dictionary<string, object> { ["type"] = "number" },
                            ["y"] = new Dictionary<string, object> { ["type"] = "number" },
                            ["z"] = new Dictionary<string, object> { ["type"] = "number" },
                        }
                    },
                    ["active"] = Bool("Whether the object starts active"),
                }, new [] { "name" }),
            Fn("delete_gameobject", "Deletes a GameObject from the active Unity scene.",
                new Dictionary<string, object> { ["gameObjectPath"] = Str("Path to the object to delete") }, new [] { "gameObjectPath" }),
            Fn("duplicate_gameobject", "Duplicates a GameObject in the active Unity scene.",
                new Dictionary<string, object>
                {
                    ["gameObjectPath"] = Str("Path to the object to duplicate"),
                    ["name"] = Str("Optional new name"),
                    ["parentPath"] = Str("Optional parent path"),
                }, new [] { "gameObjectPath" }),
            Fn("rename_gameobject", "Renames a GameObject in the active Unity scene.",
                new Dictionary<string, object>
                {
                    ["gameObjectPath"] = Str("Current path of the object"),
                    ["name"] = Str("New name"),
                }, new [] { "gameObjectPath", "name" }),
            Fn("save_as_prefab", "Saves a GameObject as a prefab asset.",
                new Dictionary<string, object>
                {
                    ["gameObjectPath"] = Str("Path to the scene object"),
                    ["assetPath"] = Str("Prefab path under Assets, e.g. Assets/Prefabs/Player.prefab"),
                }, new [] { "gameObjectPath", "assetPath" }),
            Fn("instantiate_prefab", "Instantiates a prefab asset into the active Unity scene.",
                new Dictionary<string, object>
                {
                    ["assetPath"] = Str("Prefab asset path"),
                    ["name"] = Str("Optional instance name"),
                    ["parentPath"] = Str("Optional parent path"),
                }, new [] { "assetPath" }),
            Fn("create_script", "Creates a new C# MonoBehaviour script and triggers compilation.",
                new Dictionary<string, object>
                {
                    ["fileName"] = Str("Class name without .cs extension"),
                    ["code"] = Str("Full C# source code"),
                }, new [] { "fileName", "code" }),
            Fn("edit_script", "Edits an existing C# script and triggers recompilation.",
                new Dictionary<string, object>
                {
                    ["filePath"] = Str("Path relative to the Unity project root"),
                    ["code"] = Str("The new full C# source code to write to the file"),
                }, new [] { "filePath" }),
            Fn("get_compile_errors", "Returns current Unity compilation errors."),
            Fn("set_component_property", "Sets a field on a component attached to a GameObject.",
                new Dictionary<string, object>
                {
                    ["gameObjectPath"] = Str("Path to the GameObject"),
                    ["componentType"] = Str("Component type, e.g. HealthSystem"),
                    ["property"] = Str("Field or property name"),
                    ["value"] = Str("Value as a string; bridge casts it to the right type"),
                }, new [] { "gameObjectPath", "componentType", "property", "value" }),
            Fn("enter_play_mode", "Enters Unity play mode to test the project."),
            Fn("exit_play_mode", "Exits Unity play mode."),
        };
    }

    static Dictionary<string, object> Fn(string name, string description, Dictionary<string, object> properties = null, IEnumerable<string> required = null)
    {
        var parameters = new Dictionary<string, object>
        {
            ["type"] = "object",
            ["properties"] = properties ?? new Dictionary<string, object>()
        };

        if (required != null)
            parameters["required"] = required.ToArray();

        return new Dictionary<string, object>
        {
            ["name"] = name,
            ["description"] = description,
            ["parameters"] = parameters,
        };
    }

    static Dictionary<string, object> MakeMessage(string role, string content)
    {
        return new Dictionary<string, object>
        {
            ["role"] = role,
            ["content"] = content
        };
    }

    static string BuildSystemPrompt()
    {
        return @"You are FORGE, a Unity coding agent running inside the Unity Editor.
You can read and modify the live project directly with tools.
Do not merely explain changes. Use tool calls to perform them.
Always start by calling get_scene_state before making edits.
For visible demos, create primitive GameObjects with create_gameobject using primitiveType Cube, Sphere, Capsule, Cylinder, or Plane.
If the target object does not exist, create it before attaching components.
When writing C# code, keep it standard Unity style. The editor will automatically call get_compile_errors after script creation.
If a component should be attached, create the script first, then call set_component_property for at least one serialized field.";
    }

    static Dictionary<string, object> Str(string description) => new Dictionary<string, object>
    {
        ["type"] = "string",
        ["description"] = description,
    };

    static Dictionary<string, object> Bool(string description) => new Dictionary<string, object>
    {
        ["type"] = "boolean",
        ["description"] = description,
    };
}
