using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using System.Collections.Generic;

public static class ForgeGameObjectOps
{
    public static object CreateGameObject(Dictionary<string, object> args)
    {
        var name = GetArg(args, "name");
        if (string.IsNullOrWhiteSpace(name))
            return new { ok = false, error = "create_gameobject requires a name." };

        var parentPath = GetArg(args, "parentPath", "parent");
        var primitiveType = GetArg(args, "primitiveType", "primitive");
        var position = ParseVector3(args.TryGetValue("position", out var posValue) ? posValue : null, Vector3.zero);
        var active = !args.TryGetValue("active", out var activeValue) || ParseBool(activeValue, true);

        var parent = string.IsNullOrWhiteSpace(parentPath) ? null : ForgeSceneReader.FindGameObjectByPath(parentPath);
        if (!string.IsNullOrWhiteSpace(parentPath) && parent == null)
            return new { ok = false, error = $"Parent GameObject not found: {parentPath}" };

        GameObject go;
        if (!string.IsNullOrWhiteSpace(primitiveType) && primitiveType != "Empty")
        {
            if (!System.Enum.TryParse(primitiveType, true, out PrimitiveType parsedPrimitive))
                return new { ok = false, error = $"Unknown primitiveType: {primitiveType}" };

            go = GameObject.CreatePrimitive(parsedPrimitive);
            go.name = name;
        }
        else
        {
            go = new GameObject(name);
        }

        if (parent != null)
            go.transform.SetParent(parent.transform, false);

        go.transform.position = position;
        go.SetActive(active);

        Undo.RegisterCreatedObjectUndo(go, "Create GameObject");
        Selection.activeGameObject = go;
        EditorSceneManager.MarkSceneDirty(go.scene);

        return new
        {
            ok = true,
            path = GetPath(go.transform),
            name = go.name,
            primitiveType = string.IsNullOrWhiteSpace(primitiveType) ? "Empty" : primitiveType,
            position = new { x = go.transform.position.x, y = go.transform.position.y, z = go.transform.position.z },
            active = go.activeSelf,
        };
    }

    static string GetArg(Dictionary<string, object> args, params string[] names)
    {
        foreach (var name in names)
        {
            if (args.ContainsKey(name) && args[name] != null)
                return args[name].ToString();
        }

        return string.Empty;
    }

    static Vector3 ParseVector3(object value, Vector3 fallback)
    {
        if (value == null) return fallback;

        if (value is Dictionary<string, object> dict)
        {
            return new Vector3(
                ParseFloat(dict.TryGetValue("x", out var x) ? x : null, fallback.x),
                ParseFloat(dict.TryGetValue("y", out var y) ? y : null, fallback.y),
                ParseFloat(dict.TryGetValue("z", out var z) ? z : null, fallback.z)
            );
        }

        var text = value.ToString();
        if (string.IsNullOrWhiteSpace(text)) return fallback;

        var parts = text.Split(',');
        if (parts.Length != 3) return fallback;

        return new Vector3(
            ParseFloat(parts[0], fallback.x),
            ParseFloat(parts[1], fallback.y),
            ParseFloat(parts[2], fallback.z)
        );
    }

    static float ParseFloat(object value, float fallback)
    {
        if (value == null) return fallback;
        return float.TryParse(value.ToString(), out var parsed) ? parsed : fallback;
    }

    static bool ParseBool(object value, bool fallback)
    {
        if (value == null) return fallback;
        return bool.TryParse(value.ToString(), out var parsed) ? parsed : fallback;
    }

    static string GetPath(Transform current)
    {
        if (current.parent == null)
            return current.name;
        return GetPath(current.parent) + "/" + current.name;
    }
}