using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

public class ForgeChatWindow : EditorWindow
{
    class ChatLine
    {
        public string Role;
        public string Text;
    }

    readonly List<ChatLine> _lines = new();
    Vector2 _scroll;
    string _prompt = string.Empty;
    string _status = "Ready";
    string _baseUrl = string.Empty;
    string _model = string.Empty;
    string _reference = string.Empty;
    bool _prototypeMode = true;

    const string HealthSystemCode = @"using UnityEngine;
using UnityEngine.Events;

public class HealthSystem : MonoBehaviour
{
    [Header(""Health Settings"")]
    public float maxHealth = 100f;
    public float currentHealth;

    [Header(""Events"")]
    public UnityEvent onDeath;
    public UnityEvent<float> onHealthChanged;

    void Awake() => currentHealth = maxHealth;

    public void TakeDamage(float amount)
    {
        currentHealth = Mathf.Clamp(currentHealth - amount, 0, maxHealth);
        onHealthChanged?.Invoke(currentHealth);
        if (currentHealth <= 0) onDeath?.Invoke();
    }

    public void Heal(float amount)
    {
        currentHealth = Mathf.Clamp(currentHealth + amount, 0, maxHealth);
        onHealthChanged?.Invoke(currentHealth);
    }

    public bool IsAlive => currentHealth > 0;
}
";

    [MenuItem("Window/FORGE Chat")]
    public static void ShowWindow()
    {
        GetWindow<ForgeChatWindow>("FORGE Chat");
    }

    void OnEnable()
    {
        _baseUrl = ForgeCloudAgent.GetBaseUrl();
        _model = ForgeCloudAgent.GetModel();
    }

    void OnGUI()
    {
        EditorGUILayout.Space(4);
        EditorGUILayout.LabelField("FORGE Chat", EditorStyles.boldLabel);
        EditorGUILayout.LabelField("Mode", $"Local Ollama ({_model})");
        EditorGUILayout.LabelField("Bridge", ForgeWebSocketServer.IsListening ? "Listening" : "Stopped");
        EditorGUILayout.LabelField("Status", _status);
        EditorGUILayout.Space(4);

        EditorGUILayout.LabelField("Ollama Settings", EditorStyles.boldLabel);
        _baseUrl = EditorGUILayout.TextField("Ollama Base URL", _baseUrl);
        _model = EditorGUILayout.TextField("Ollama Model", _model);

        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Save Settings", GUILayout.Height(24)))
        {
            ForgeCloudAgent.SetBaseUrl(_baseUrl);
            ForgeCloudAgent.SetModel(_model);
            _status = $"Local Ollama enabled with {_model}";
            Repaint();
        }

        if (GUILayout.Button("Reload From Env", GUILayout.Height(24)))
        {
            _baseUrl = ForgeCloudAgent.GetBaseUrl();
            _model = ForgeCloudAgent.GetModel();
            _status = $"Local Ollama enabled with {_model}";
            Repaint();
        }
        EditorGUILayout.EndHorizontal();

        EditorGUILayout.Space(4);

        EditorGUILayout.LabelField("Prototype Builder", EditorStyles.boldLabel);
        _prototypeMode = EditorGUILayout.ToggleLeft("Turn vague game prompts into visible playable prototypes", _prototypeMode);
        _reference = EditorGUILayout.TextField("Image / Example Notes", _reference);
        EditorGUILayout.HelpBox(
            "Optional: paste a short visual reference like \"temple runner\", \"space shooter\", \"maze\", or \"coin game\". FORGE uses it as inspiration for deterministic prototype scenes.",
            MessageType.None
        );

        EditorGUILayout.Space(4);

        _scroll = EditorGUILayout.BeginScrollView(_scroll, GUILayout.ExpandHeight(true));
        foreach (var line in _lines)
        {
            var style = new GUIStyle(EditorStyles.wordWrappedLabel)
            {
                richText = true,
                wordWrap = true
            };

            EditorGUILayout.LabelField($"<b>{line.Role}:</b> {line.Text}", style);
            EditorGUILayout.Space(4);
        }
        EditorGUILayout.EndScrollView();

        EditorGUILayout.Space(4);
        _prompt = EditorGUILayout.TextArea(_prompt, GUILayout.MinHeight(60));

        EditorGUILayout.BeginHorizontal();
        GUI.enabled = !string.IsNullOrWhiteSpace(_prompt);
        if (GUILayout.Button("Send", GUILayout.Height(28)))
        {
            ExecutePrompt(_prompt.Trim());
        }
        GUI.enabled = true;

        if (GUILayout.Button("Clear", GUILayout.Height(28), GUILayout.Width(80)))
        {
            _lines.Clear();
            _status = "Ready";
            Repaint();
        }
        EditorGUILayout.EndHorizontal();

        EditorGUILayout.HelpBox(
            "This is a local Unity editor chat window. It can create, rename, duplicate, delete, and prefab objects without the web UI.",
            MessageType.Info
        );
    }

    async void ExecutePrompt(string prompt)
    {
        _lines.Add(new ChatLine { Role = "You", Text = prompt });
        ForgeCloudAgent.SetBaseUrl(_baseUrl);
        ForgeCloudAgent.SetModel(_model);
        _status = "Running local Ollama agent";
        Repaint();

        try
        {
            var effectivePrompt = string.IsNullOrWhiteSpace(_reference)
                ? prompt
                : $"{prompt}\nVisual reference / example notes: {_reference}";

            if (CanUseLocalPlanner(prompt))
            {
                var fallback = RunLocalPlanner(effectivePrompt);
                _lines.Add(new ChatLine { Role = "FORGE", Text = fallback });
                _status = "Local planner done";
                return;
            }

            var sawToolCall = false;
            var result = await ForgeCloudAgent.RunAsync(effectivePrompt, text =>
            {
                if (!string.IsNullOrWhiteSpace(text))
                {
                    if (text.StartsWith("Calling ", StringComparison.OrdinalIgnoreCase))
                        sawToolCall = true;
                    _lines.Add(new ChatLine { Role = "FORGE", Text = text });
                }
                Repaint();
            });

            if (!string.IsNullOrWhiteSpace(result))
                _lines.Add(new ChatLine { Role = "FORGE", Text = result });

            if (!sawToolCall && CanUseLocalPlanner(effectivePrompt))
            {
                _lines.Add(new ChatLine { Role = "FORGE", Text = "The model answered without using tools, so I am running the local planner." });
                var fallback = RunLocalPlanner(effectivePrompt);
                _lines.Add(new ChatLine { Role = "FORGE", Text = fallback });
                _status = "Model answered without tools, local planner done";
            }
            else
            {
                _status = "Local Ollama agent done";
            }
        }
        catch (Exception ex)
        {
            _lines.Add(new ChatLine { Role = "FORGE", Text = ex.Message });
            _lines.Add(new ChatLine { Role = "FORGE", Text = "Ollama agent failed, falling back to the built-in local planner." });
            try
            {
                    var fallback = RunLocalPlanner(string.IsNullOrWhiteSpace(_reference) ? prompt : $"{prompt}\nVisual reference / example notes: {_reference}");
                _lines.Add(new ChatLine { Role = "FORGE", Text = fallback });
                _status = "Ollama failed, local fallback done";
            }
            catch (Exception fallbackEx)
            {
                _lines.Add(new ChatLine { Role = "FORGE", Text = fallbackEx.Message });
                _status = "Error";
            }
        }
        finally
        {
            _prompt = string.Empty;
            Repaint();
        }
    }

    string RunLocalPlanner(string prompt)
    {
        var lower = prompt.ToLowerInvariant();

        if (_prototypeMode && IsVagueGamePrompt(lower))
            return RunPrototypeFromPrompt(prompt);

        if (lower.Contains("health") && lower.Contains("player"))
            return RunHealthSystemFlow(prompt);

        if ((lower.Contains("game") || lower.Contains("level") || lower.Contains("demo")) &&
            (lower.Contains("coin") || lower.Contains("obstacle") || lower.Contains("playable")))
            return RunCoinCollectorSceneFlow();

        if (lower.Contains("attach") && lower.Contains("health") && lower.Contains("player"))
            return AttachComponentFlow("Player", "HealthSystem", "maxHealth", "100");

        if ((lower.Contains("component") || lower.Contains("attach")) && lower.Contains("player"))
            return AttachComponentFlow("Player", ExtractComponentName(prompt) ?? "HealthSystem", "maxHealth", "100");

        if (lower.Contains("save") && lower.Contains("prefab"))
            return RunPrefabSaveFlow(prompt);

        if (lower.Contains("instantiate") && lower.Contains("prefab"))
            return RunPrefabInstantiateFlow(prompt);

        if (lower.Contains("duplicate"))
            return RunDuplicateFlow(prompt);

        if (lower.Contains("rename"))
            return RunRenameFlow(prompt);

        if (lower.Contains("delete") || lower.Contains("remove"))
            return RunDeleteFlow(prompt);

        if (lower.Contains("create") || lower.Contains("make") || lower.Contains("spawn"))
            return RunCreateObjectFlow(prompt);

        return "I can handle common object lifecycle requests like create, delete, duplicate, rename, save prefab, instantiate prefab, and the built-in health-system flow. Try a more specific prompt.";
    }

    static bool CanUseLocalPlanner(string prompt)
    {
        var lower = prompt.ToLowerInvariant();
        return (lower.Contains("health") && lower.Contains("player"))
            || IsVagueGamePrompt(lower)
            || lower.Contains("save prefab")
            || lower.Contains("instantiate prefab")
            || lower.Contains("duplicate")
            || lower.Contains("rename")
            || lower.Contains("delete")
            || lower.Contains("remove")
            || lower.Contains("create")
            || lower.Contains("make")
            || lower.Contains("spawn");
    }

    static bool IsVagueGamePrompt(string lower)
    {
        return lower.Contains("make me a game")
            || lower.Contains("make a game")
            || lower.Contains("create a game")
            || lower.Contains("build a game")
            || lower.Contains("make me something playable")
            || lower.Contains("playable prototype")
            || lower.Contains("prototype game")
            || lower.Contains("game like")
            || lower.Contains("image")
            || lower.Contains("reference");
    }

    string RunPrototypeFromPrompt(string prompt)
    {
        var lower = prompt.ToLowerInvariant();

        if (lower.Contains("space") || lower.Contains("shooter") || lower.Contains("alien"))
            return RunSpaceShooterPrototype();

        if (lower.Contains("maze") || lower.Contains("pac") || lower.Contains("labyrinth"))
            return RunMazePrototype();

        if (lower.Contains("platform") || lower.Contains("jump") || lower.Contains("runner"))
            return RunPlatformerPrototype();

        if (lower.Contains("target") || lower.Contains("shoot") || lower.Contains("fps"))
            return RunTargetPracticePrototype();

        return RunCoinCollectorSceneFlow();
    }

    string RunHealthSystemFlow(string prompt)
    {
        var sceneState = CallTool("get_scene_state", new Dictionary<string, object>());
        var playerExists = SceneContainsObject(sceneState, "Player");

        if (!playerExists)
        {
            CallTool("create_gameobject", new Dictionary<string, object>
            {
                ["name"] = "Player",
                ["position"] = new Dictionary<string, object> { ["x"] = 0, ["y"] = 0, ["z"] = 0 },
                ["active"] = true,
            });
        }

        CallTool("create_script", new Dictionary<string, object>
        {
            ["fileName"] = "HealthSystem",
            ["code"] = HealthSystemCode,
        });

        CallTool("set_component_property", new Dictionary<string, object>
        {
            ["gameObjectPath"] = "Player",
            ["componentType"] = "HealthSystem",
            ["property"] = "maxHealth",
            ["value"] = "100",
        });

        var compileErrors = CallTool("get_compile_errors", new Dictionary<string, object>());
        return $"Created or updated Player with HealthSystem. Compile check: {JsonConvert.SerializeObject(compileErrors)}";
    }

    string RunCoinCollectorSceneFlow()
    {
        var created = new List<object>
        {
            CallTool("create_gameobject", MakeCreateArgs("Ground", "Plane", 0, 0, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Player", "Capsule", 0, 1, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_1", "Sphere", -2, 1, 3)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_2", "Sphere", 0, 1, 4)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_3", "Sphere", 2, 1, 5)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_4", "Sphere", -1, 1, 6)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_5", "Sphere", 1, 1, 7)),
            CallTool("create_gameobject", MakeCreateArgs("Obstacle_1", "Cube", -1, 0.5f, 2)),
            CallTool("create_gameobject", MakeCreateArgs("Obstacle_2", "Cube", 1, 0.5f, 4)),
            CallTool("create_gameobject", MakeCreateArgs("Obstacle_3", "Cube", 0, 0.5f, 6)),
            CallTool("create_gameobject", MakeCreateArgs("FinishLine", "Cylinder", 0, 1, 8)),
        };

        return $"Built a visible coin collector scene with {created.Count} primitive objects. Press Play or switch to Game view to inspect it.";
    }

    string RunSpaceShooterPrototype()
    {
        var created = new List<object>
        {
            CallTool("create_gameobject", MakeCreateArgs("Space_Backdrop", "Plane", 0, 0, 6)),
            CallTool("create_gameobject", MakeCreateArgs("PlayerShip", "Capsule", 0, 1, -4)),
            CallTool("create_gameobject", MakeCreateArgs("Asteroid_1", "Sphere", -3, 1, 1)),
            CallTool("create_gameobject", MakeCreateArgs("Asteroid_2", "Sphere", 0, 1, 2)),
            CallTool("create_gameobject", MakeCreateArgs("Asteroid_3", "Sphere", 3, 1, 3)),
            CallTool("create_gameobject", MakeCreateArgs("Alien_1", "Cube", -2, 1, 5)),
            CallTool("create_gameobject", MakeCreateArgs("Alien_2", "Cube", 2, 1, 5)),
            CallTool("create_gameobject", MakeCreateArgs("GoalPortal", "Cylinder", 0, 1, 8)),
        };

        return $"Built a visible space shooter prototype with {created.Count} objects: ship, asteroids, aliens, and goal portal.";
    }

    string RunMazePrototype()
    {
        var created = new List<object>
        {
            CallTool("create_gameobject", MakeCreateArgs("MazeFloor", "Plane", 0, 0, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Player", "Capsule", -4, 1, -4)),
            CallTool("create_gameobject", MakeCreateArgs("Wall_North", "Cube", 0, 0.5f, 5)),
            CallTool("create_gameobject", MakeCreateArgs("Wall_South", "Cube", 0, 0.5f, -5)),
            CallTool("create_gameobject", MakeCreateArgs("Wall_East", "Cube", 5, 0.5f, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Wall_West", "Cube", -5, 0.5f, 0)),
            CallTool("create_gameobject", MakeCreateArgs("MazeWall_1", "Cube", -2, 0.5f, -2)),
            CallTool("create_gameobject", MakeCreateArgs("MazeWall_2", "Cube", 0, 0.5f, -1)),
            CallTool("create_gameobject", MakeCreateArgs("MazeWall_3", "Cube", 2, 0.5f, 1)),
            CallTool("create_gameobject", MakeCreateArgs("ExitGoal", "Cylinder", 4, 1, 4)),
        };

        return $"Built a visible maze prototype with {created.Count} objects. Use Scene/Game view to show the player, walls, and exit goal.";
    }

    string RunPlatformerPrototype()
    {
        var created = new List<object>
        {
            CallTool("create_gameobject", MakeCreateArgs("Player", "Capsule", -4, 1, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Platform_Start", "Cube", -4, 0, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Platform_1", "Cube", -2, 1, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Platform_2", "Cube", 0, 2, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Platform_3", "Cube", 2, 3, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_1", "Sphere", -2, 2, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_2", "Sphere", 0, 3, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Coin_3", "Sphere", 2, 4, 0)),
            CallTool("create_gameobject", MakeCreateArgs("FinishFlag", "Cylinder", 4, 3, 0)),
        };

        return $"Built a visible platformer prototype with {created.Count} objects: player, platforms, coins, and finish flag.";
    }

    string RunTargetPracticePrototype()
    {
        var created = new List<object>
        {
            CallTool("create_gameobject", MakeCreateArgs("RangeFloor", "Plane", 0, 0, 0)),
            CallTool("create_gameobject", MakeCreateArgs("Player", "Capsule", 0, 1, -4)),
            CallTool("create_gameobject", MakeCreateArgs("Target_1", "Sphere", -3, 1, 4)),
            CallTool("create_gameobject", MakeCreateArgs("Target_2", "Sphere", -1, 1, 5)),
            CallTool("create_gameobject", MakeCreateArgs("Target_3", "Sphere", 1, 1, 5)),
            CallTool("create_gameobject", MakeCreateArgs("Target_4", "Sphere", 3, 1, 4)),
            CallTool("create_gameobject", MakeCreateArgs("Cover_1", "Cube", -2, 0.5f, 2)),
            CallTool("create_gameobject", MakeCreateArgs("Cover_2", "Cube", 2, 0.5f, 2)),
        };

        return $"Built a visible target-practice prototype with {created.Count} objects: player, targets, and cover.";
    }

    string AttachComponentFlow(string gameObjectPath, string componentType, string property, string value)
    {
        var result = CallTool("set_component_property", new Dictionary<string, object>
        {
            ["gameObjectPath"] = gameObjectPath,
            ["componentType"] = componentType,
            ["property"] = property,
            ["value"] = value,
        });

        return $"Attached/configured {componentType} on {gameObjectPath}: {JsonConvert.SerializeObject(result)}";
    }

    string RunCreateObjectFlow(string prompt)
    {
        var primitiveType = ExtractPrimitiveType(prompt);
        var name = ExtractNamedObject(prompt) ?? ExtractNameAfterKeywords(prompt, new[] { "create", "make", "spawn" }) ?? primitiveType ?? "NewObject";
        var result = CallTool("create_gameobject", new Dictionary<string, object>
        {
            ["name"] = name,
            ["primitiveType"] = primitiveType ?? "Empty",
            ["position"] = new Dictionary<string, object> { ["x"] = 0, ["y"] = primitiveType == "Plane" ? 0 : 1, ["z"] = 0 },
            ["active"] = true,
        });

        return $"Created GameObject: {JsonConvert.SerializeObject(result)}";
    }

    static Dictionary<string, object> MakeCreateArgs(string name, string primitiveType, float x, float y, float z)
    {
        return new Dictionary<string, object>
        {
            ["name"] = name,
            ["primitiveType"] = primitiveType,
            ["position"] = new Dictionary<string, object> { ["x"] = x, ["y"] = y, ["z"] = z },
            ["active"] = true,
        };
    }

    string RunDeleteFlow(string prompt)
    {
        var target = ExtractTargetName(prompt) ?? "Player";
        var result = CallTool("delete_gameobject", new Dictionary<string, object>
        {
            ["gameObjectPath"] = target,
        });

        return $"Delete result: {JsonConvert.SerializeObject(result)}";
    }

    string RunRenameFlow(string prompt)
    {
        var match = Regex.Match(prompt, @"rename\s+(?<from>.+?)\s+to\s+(?<to>.+)$", RegexOptions.IgnoreCase);
        var from = match.Success ? match.Groups["from"].Value.Trim() : ExtractTargetName(prompt) ?? "Player";
        var to = match.Success ? match.Groups["to"].Value.Trim() : "RenamedObject";

        var result = CallTool("rename_gameobject", new Dictionary<string, object>
        {
            ["gameObjectPath"] = from,
            ["name"] = to,
        });

        return $"Rename result: {JsonConvert.SerializeObject(result)}";
    }

    string RunDuplicateFlow(string prompt)
    {
        var target = ExtractTargetName(prompt) ?? "Player";
        var newName = ExtractAfterKeyword(prompt, "as") ?? ExtractAfterKeyword(prompt, "to") ?? target + " Copy";
        var result = CallTool("duplicate_gameobject", new Dictionary<string, object>
        {
            ["gameObjectPath"] = target,
            ["name"] = newName,
            ["position"] = new Dictionary<string, object> { ["x"] = 1, ["y"] = 0, ["z"] = 0 },
        });

        return $"Duplicate result: {JsonConvert.SerializeObject(result)}";
    }

    string RunPrefabSaveFlow(string prompt)
    {
        var target = ExtractTargetName(prompt) ?? "Player";
        var assetPath = ExtractPathLike(prompt) ?? "Assets/Prefabs/Generated.prefab";
        var result = CallTool("save_as_prefab", new Dictionary<string, object>
        {
            ["gameObjectPath"] = target,
            ["assetPath"] = assetPath,
        });

        return $"Prefab save result: {JsonConvert.SerializeObject(result)}";
    }

    string RunPrefabInstantiateFlow(string prompt)
    {
        var assetPath = ExtractPathLike(prompt) ?? "Assets/Prefabs/Generated.prefab";
        var name = ExtractAfterKeyword(prompt, "as") ?? ExtractAfterKeyword(prompt, "name") ?? "PrefabInstance";
        var result = CallTool("instantiate_prefab", new Dictionary<string, object>
        {
            ["assetPath"] = assetPath,
            ["name"] = name,
            ["position"] = new Dictionary<string, object> { ["x"] = 0, ["y"] = 0, ["z"] = 0 },
        });

        return $"Prefab instantiate result: {JsonConvert.SerializeObject(result)}";
    }

    object CallTool(string tool, Dictionary<string, object> args)
    {
        var responseJson = ForgeDispatcher.Dispatch(new ForgeCommand
        {
            id = Guid.NewGuid().ToString("N"),
            tool = tool,
            args = args,
        });

        var response = JsonConvert.DeserializeObject<Dictionary<string, object>>(responseJson);
        if (response != null && response.TryGetValue("ok", out var okValue) && okValue is bool ok && ok)
            return response.TryGetValue("result", out var result) ? result : null;

        var error = response != null && response.TryGetValue("error", out var errorValue)
            ? errorValue?.ToString()
            : "Unknown tool error.";
        throw new Exception(error);
    }

    static bool SceneContainsObject(object sceneState, string objectName)
    {
        if (sceneState == null) return false;

        var json = JsonConvert.SerializeObject(sceneState);
        return json.IndexOf($"\"name\":\"{objectName}\"", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    static string ExtractTargetName(string prompt)
    {
        var match = Regex.Match(prompt, @"(?<name>[A-Za-z0-9_]+)(?:\s+GameObject)?", RegexOptions.IgnoreCase);
        if (match.Success)
        {
            var candidate = match.Groups["name"].Value.Trim();
            if (!string.IsNullOrWhiteSpace(candidate) && !IsCommandWord(candidate))
                return candidate;
        }

        return null;
    }

    static string ExtractNameAfterKeywords(string prompt, IEnumerable<string> keywords)
    {
        foreach (var keyword in keywords)
        {
            var match = Regex.Match(prompt, $@"{keyword}\s+(?:a\s+|an\s+|the\s+)?(?<name>[A-Za-z0-9_]+)", RegexOptions.IgnoreCase);
            if (match.Success)
                return match.Groups["name"].Value.Trim();
        }

        return null;
    }

    static string ExtractNamedObject(string prompt)
    {
        var match = Regex.Match(prompt, @"named\s+(?<name>[A-Za-z0-9_]+)", RegexOptions.IgnoreCase);
        if (match.Success) return match.Groups["name"].Value.Trim();

        match = Regex.Match(prompt, @"called\s+(?<name>[A-Za-z0-9_]+)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["name"].Value.Trim() : null;
    }

    static string ExtractPrimitiveType(string prompt)
    {
        var lower = prompt.ToLowerInvariant();
        if (lower.Contains("capsule") || lower.Contains("character") || lower.Contains("player")) return "Capsule";
        if (lower.Contains("sphere") || lower.Contains("coin") || lower.Contains("orb")) return "Sphere";
        if (lower.Contains("cube") || lower.Contains("box") || lower.Contains("wall") || lower.Contains("obstacle")) return "Cube";
        if (lower.Contains("plane") || lower.Contains("ground") || lower.Contains("floor")) return "Plane";
        if (lower.Contains("cylinder") || lower.Contains("finish")) return "Cylinder";
        return null;
    }

    static string ExtractComponentName(string prompt)
    {
        var match = Regex.Match(prompt, @"(?:attach|add)\s+(?:the\s+|a\s+|an\s+)?(?<name>[A-Za-z0-9_]+)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["name"].Value.Trim() : null;
    }

    static string ExtractAfterKeyword(string prompt, string keyword)
    {
        var match = Regex.Match(prompt, $@"{keyword}\s+(?<value>[A-Za-z0-9_./\\-]+)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["value"].Value.Trim() : null;
    }

    static string ExtractPathLike(string prompt)
    {
        var match = Regex.Match(prompt, @"(?<path>(?:[A-Za-z]:)?[\\/A-Za-z0-9_.-]+\.prefab)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["path"].Value.Trim() : null;
    }

    static bool IsCommandWord(string value)
    {
        var lower = value.ToLowerInvariant();
        return lower is "create" or "delete" or "duplicate" or "rename" or "save" or "instantiate" or "make" or "spawn" or "add";
    }
}
