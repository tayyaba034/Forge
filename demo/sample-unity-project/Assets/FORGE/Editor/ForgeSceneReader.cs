using UnityEngine;
using UnityEditor;
using System.Collections.Generic;
using System.Linq;
using UnityEditor.SceneManagement;

public static class ForgeSceneReader
{
    public static object GetSceneState()
    {
        var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
        var roots = scene.GetRootGameObjects();
        return new {
            sceneName = scene.name,
            objects = System.Array.ConvertAll(roots, SerializeGameObject)
        };
    }

    public static object GetObjectComponents(Dictionary<string, object> args)
    {
        var path = args["gameObjectPath"].ToString();
        var go = FindGameObjectByPath(path);
        if (go == null) return new { error = "GameObject not found" };

        return new {
            path = path,
            components = go.GetComponents<Component>().Select(c => new {
                type = c.GetType().Name,
                enabled = (c as Behaviour)?.enabled ?? true,
                properties = SerializeComponentProperties(c)
            }).ToArray()
        };
    }

    public static GameObject FindGameObjectByPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;

        var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
        foreach (var root in scene.GetRootGameObjects())
        {
            if (root.name == path) return root;
            if (path.StartsWith(root.name + "/"))
            {
                var childPath = path.Substring(root.name.Length + 1);
                var child = root.transform.Find(childPath);
                if (child != null) return child.gameObject;
            }
        }

        return GameObject.Find(path);
    }

    static object SerializeGameObject(GameObject go)
    {
        return new {
            name = go.name,
            path = GetPath(go.transform),
            active = go.activeSelf,
            components = go.GetComponents<Component>().Select(c => c?.GetType().Name).ToArray(),
            children = go.transform.Cast<Transform>().Select(t => SerializeGameObject(t.gameObject)).ToArray()
        };
    }

    static string GetPath(Transform current)
    {
        if (current.parent == null)
            return current.name;
        return GetPath(current.parent) + "/" + current.name;
    }

    static Dictionary<string, object> SerializeComponentProperties(Component component)
    {
        var values = new Dictionary<string, object>();
        if (component == null) return values;

        var serialized = new SerializedObject(component);
        var iterator = serialized.GetIterator();
        var enterChildren = true;

        while (iterator.NextVisible(enterChildren))
        {
            enterChildren = false;
            if (iterator.propertyPath == "m_Script") continue;

            switch (iterator.propertyType)
            {
                case SerializedPropertyType.Integer:
                    values[iterator.propertyPath] = iterator.intValue;
                    break;
                case SerializedPropertyType.Boolean:
                    values[iterator.propertyPath] = iterator.boolValue;
                    break;
                case SerializedPropertyType.Float:
                    values[iterator.propertyPath] = iterator.floatValue;
                    break;
                case SerializedPropertyType.String:
                    values[iterator.propertyPath] = iterator.stringValue;
                    break;
                case SerializedPropertyType.Enum:
                    values[iterator.propertyPath] = iterator.enumDisplayNames[iterator.enumValueIndex];
                    break;
            }
        }

        return values;
    }
}
