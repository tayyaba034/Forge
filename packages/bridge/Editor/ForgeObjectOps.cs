using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using System.Collections.Generic;

public static class ForgeObjectOps
{
    public static object DeleteGameObject(Dictionary<string, object> args)
    {
        var path = GetArg(args, "gameObjectPath", "path");
        var go = ForgeSceneReader.FindGameObjectByPath(path);
        if (go == null)
            return new { ok = false, error = $"GameObject not found: {path}" };

        Undo.DestroyObjectImmediate(go);
        EditorSceneManager.MarkSceneDirty(UnityEngine.SceneManagement.SceneManager.GetActiveScene());

        return new { ok = true, deletedPath = path };
    }

    public static object DuplicateGameObject(Dictionary<string, object> args)
    {
        var sourcePath = GetArg(args, "gameObjectPath", "path");
        var newName = GetArg(args, "name", "newName");
        var parentPath = GetArg(args, "parentPath", "parent");

        var source = ForgeSceneReader.FindGameObjectByPath(sourcePath);
        if (source == null)
            return new { ok = false, error = $"GameObject not found: {sourcePath}" };

        var clone = Object.Instantiate(source);
        clone.name = string.IsNullOrWhiteSpace(newName) ? source.name + " Copy" : newName;

        var parent = string.IsNullOrWhiteSpace(parentPath) ? source.transform.parent : ForgeSceneReader.FindGameObjectByPath(parentPath)?.transform;
        clone.transform.SetParent(parent, false);

        var position = ParseVector3(args.TryGetValue("position", out var posValue) ? posValue : null, source.transform.position + new Vector3(1f, 0f, 0f));
        clone.transform.position = position;

        Undo.RegisterCreatedObjectUndo(clone, "Duplicate GameObject");
        Selection.activeGameObject = clone;
        EditorSceneManager.MarkSceneDirty(clone.scene);

        return new { ok = true, path = GetPath(clone.transform), name = clone.name };
    }

    public static object RenameGameObject(Dictionary<string, object> args)
    {
        var path = GetArg(args, "gameObjectPath", "path");
        var newName = GetArg(args, "name", "newName");

        var go = ForgeSceneReader.FindGameObjectByPath(path);
        if (go == null)
            return new { ok = false, error = $"GameObject not found: {path}" };

        if (string.IsNullOrWhiteSpace(newName))
            return new { ok = false, error = "rename_gameobject requires a new name." };

        Undo.RecordObject(go, "Rename GameObject");
        go.name = newName;
        EditorUtility.SetDirty(go);
        EditorSceneManager.MarkSceneDirty(go.scene);

        return new { ok = true, oldPath = path, newPath = GetPath(go.transform), name = go.name };
    }

    public static object CreatePrefab(Dictionary<string, object> args)
    {
        var sourcePath = GetArg(args, "gameObjectPath", "path");
        var assetPath = GetArg(args, "assetPath", "prefabPath", "pathInProject");

        var source = ForgeSceneReader.FindGameObjectByPath(sourcePath);
        if (source == null)
            return new { ok = false, error = $"GameObject not found: {sourcePath}" };

        if (string.IsNullOrWhiteSpace(assetPath))
            return new { ok = false, error = "create_prefab requires assetPath." };

        if (!assetPath.EndsWith(".prefab"))
            assetPath += ".prefab";

        var directory = System.IO.Path.GetDirectoryName(assetPath);
        if (!string.IsNullOrWhiteSpace(directory) && !System.IO.Directory.Exists(directory))
            System.IO.Directory.CreateDirectory(directory);

        var prefab = PrefabUtility.SaveAsPrefabAssetAndConnect(source, assetPath, InteractionMode.UserAction);
        AssetDatabase.Refresh();

        return new { ok = true, prefabPath = assetPath, saved = prefab != null };
    }

    public static object InstantiatePrefab(Dictionary<string, object> args)
    {
        var assetPath = GetArg(args, "assetPath", "prefabPath");
        var name = GetArg(args, "name");
        var parentPath = GetArg(args, "parentPath", "parent");
        var position = ParseVector3(args.TryGetValue("position", out var posValue) ? posValue : null, Vector3.zero);

        if (string.IsNullOrWhiteSpace(assetPath))
            return new { ok = false, error = "instantiate_prefab requires assetPath." };

        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
        if (prefab == null)
            return new { ok = false, error = $"Prefab not found: {assetPath}" };

        var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        instance.name = string.IsNullOrWhiteSpace(name) ? prefab.name : name;

        var parent = string.IsNullOrWhiteSpace(parentPath) ? null : ForgeSceneReader.FindGameObjectByPath(parentPath);
        if (!string.IsNullOrWhiteSpace(parentPath) && parent == null)
            return new { ok = false, error = $"Parent GameObject not found: {parentPath}" };

        if (parent != null)
            instance.transform.SetParent(parent.transform, false);

        instance.transform.position = position;

        Undo.RegisterCreatedObjectUndo(instance, "Instantiate Prefab");
        Selection.activeGameObject = instance;
        EditorSceneManager.MarkSceneDirty(instance.scene);

        return new { ok = true, path = GetPath(instance.transform), prefabPath = assetPath, name = instance.name };
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

    static string GetPath(Transform current)
    {
        if (current.parent == null)
            return current.name;
        return GetPath(current.parent) + "/" + current.name;
    }
}