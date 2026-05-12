using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;
using System;
using System.Globalization;
using System.Linq;
using System.Reflection;

public static class ForgeDispatcher
{
    public static string Dispatch(ForgeCommand cmd)
    {
        try
        {
            object result = cmd.tool switch
            {
                "get_scene_state"        => ForgeSceneReader.GetSceneState(),
                "get_object_components"  => ForgeSceneReader.GetObjectComponents(cmd.args),
                "set_component_property" => ForgeSceneWriter.SetComponentProperty(cmd.args),
                "create_script"          => ForgeScriptOps.CreateScript(cmd.args),
                "edit_script"            => ForgeScriptOps.EditScript(cmd.args),
                "get_compile_errors"     => ForgeScriptOps.GetCompileErrors(),
                "enter_play_mode"        => ForgePlayMode.Enter(),
                "exit_play_mode"         => ForgePlayMode.Exit(),
                _ => throw new System.InvalidOperationException($"Unknown tool: {cmd.tool}")
            };
            return JsonConvert.SerializeObject(new { id = cmd.id, ok = true, result });
        }
        catch (System.Exception ex)
        {
            return JsonConvert.SerializeObject(new { id = cmd.id, ok = false, error = ex.Message });
        }
    }
}

public static class ForgePlayMode
{
    public static object Enter() 
    {
        EditorApplication.isPlaying = true;
        return new { mode = "Playing" };
    }
    
    public static object Exit() 
    {
        EditorApplication.isPlaying = false;
        return new { mode = "Edit" };
    }
}

public static class ForgeSceneWriter
{
    public static object SetComponentProperty(Dictionary<string, object> args)
    {
        var path = GetArg(args, "gameObjectPath", "path");
        var componentName = GetArg(args, "componentType", "component");
        var propertyName = GetArg(args, "property");
        var rawValue = args.ContainsKey("value") ? args["value"] : null;

        var go = ForgeSceneReader.FindGameObjectByPath(path);
        if (go == null)
            return new { ok = false, error = $"GameObject not found: {path}" };

        var componentType = FindComponentType(componentName);
        if (componentType == null)
            return new { ok = false, error = $"Component type not found: {componentName}. Wait for Unity to finish compiling new scripts, then retry." };

        var component = go.GetComponent(componentType);
        if (component == null)
        {
            component = go.AddComponent(componentType);
            EditorUtility.SetDirty(go);
        }

        if (!string.IsNullOrWhiteSpace(propertyName))
        {
            var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            var field = componentType.GetField(propertyName, flags);
            if (field != null)
            {
                var converted = ConvertValue(rawValue, field.FieldType);
                field.SetValue(component, converted);
                EditorUtility.SetDirty(component);
                return new { ok = true, newValue = converted?.ToString(), attached = true };
            }

            var property = componentType.GetProperty(propertyName, flags);
            if (property != null && property.CanWrite)
            {
                var converted = ConvertValue(rawValue, property.PropertyType);
                property.SetValue(component, converted);
                EditorUtility.SetDirty(component);
                return new { ok = true, newValue = converted?.ToString(), attached = true };
            }

            return new { ok = false, error = $"Property or field not found: {propertyName}" };
        }

        return new { ok = true, newValue = null as string, attached = true };
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

    static Type FindComponentType(string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) return null;

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            Type match = null;
            try
            {
                match = assembly.GetTypes().FirstOrDefault(t =>
                    typeof(Component).IsAssignableFrom(t) &&
                    (t.Name == typeName || t.FullName == typeName));
            }
            catch (ReflectionTypeLoadException ex)
            {
                match = ex.Types.FirstOrDefault(t =>
                    t != null &&
                    typeof(Component).IsAssignableFrom(t) &&
                    (t.Name == typeName || t.FullName == typeName));
            }

            if (match != null) return match;
        }

        return null;
    }

    static object ConvertValue(object value, Type targetType)
    {
        if (value == null) return targetType.IsValueType ? Activator.CreateInstance(targetType) : null;

        var text = value.ToString();
        if (targetType == typeof(string)) return text;
        if (targetType == typeof(int)) return int.Parse(text, CultureInfo.InvariantCulture);
        if (targetType == typeof(float)) return float.Parse(text, CultureInfo.InvariantCulture);
        if (targetType == typeof(double)) return double.Parse(text, CultureInfo.InvariantCulture);
        if (targetType == typeof(bool)) return bool.Parse(text);
        if (targetType.IsEnum) return Enum.Parse(targetType, text, true);

        return Convert.ChangeType(value, targetType, CultureInfo.InvariantCulture);
    }
}
