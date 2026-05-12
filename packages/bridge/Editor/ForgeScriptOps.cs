using UnityEditor;
using UnityEditor.Compilation;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

public static class ForgeScriptOps
{
    public static object CreateScript(Dictionary<string, object> args)
    {
        var fileName = SanitizeScriptName(args["fileName"].ToString());
        var code = args["code"].ToString();
        
        // Ensure directory exists
        var dir = "Assets/Scripts";
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        
        var path = $"{dir}/{fileName}.cs";
        File.WriteAllText(path, code);
        AssetDatabase.Refresh();
        AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
        
        WaitForCompilation();
        
        return new { filePath = path, compileErrors = GetCompileErrors() };
    }

    public static object EditScript(Dictionary<string, object> args)
    {
        var filePath = args["filePath"].ToString();
        if (!args.ContainsKey("code") && !args.ContainsKey("diff"))
            return new { ok = false, error = "edit_script requires either code or diff." };

        var newCode = args.ContainsKey("code") ? args["code"].ToString() : args["diff"].ToString();
        
        if (!File.Exists(filePath))
            return new { ok = false, error = "File not found: " + filePath };
        
        File.WriteAllText(filePath, newCode);
        AssetDatabase.Refresh();
        AssetDatabase.ImportAsset(filePath, ImportAssetOptions.ForceUpdate);
        
        WaitForCompilation();
        
        return new { ok = true, filePath = filePath, compileErrors = GetCompileErrors() };
    }

    public static object GetCompileErrors()
    {
        // Use CompilationPipeline to get real errors when available
        var errors = new List<string>();
        try
        {
            // Unity stores compile errors in the Editor log; a simpler approach
            // is to check if Assembly-CSharp compiles correctly
            bool hasErrors = false;
            
            var assemblies = CompilationPipeline.GetAssemblies();
            foreach (var asm in assemblies)
            {
                if (asm.name == "Assembly-CSharp")
                {
                    hasErrors = !File.Exists(asm.outputPath);
                    break;
                }
            }
            
            if (hasErrors)
                errors.Add("Compilation errors present — check the Unity Console for details.");
        }
        catch (System.Exception e)
        {
            errors.Add($"Error reading compile state: {e.Message}");
        }
        
        return errors.ToArray();
    }

    static string SanitizeScriptName(string value)
    {
        var baseName = Path.GetFileNameWithoutExtension(value ?? string.Empty);
        var clean = Regex.Replace(baseName, "[^A-Za-z0-9_]", string.Empty);
        if (string.IsNullOrWhiteSpace(clean))
            throw new System.ArgumentException("fileName must contain a valid C# class name.");
        return clean;
    }

    static void WaitForCompilation()
    {
        var startDeadline = System.DateTime.Now.AddSeconds(2);
        while (!EditorApplication.isCompiling && System.DateTime.Now < startDeadline)
            System.Threading.Thread.Sleep(100);

        var compileDeadline = System.DateTime.Now.AddSeconds(20);
        while (EditorApplication.isCompiling && System.DateTime.Now < compileDeadline)
            System.Threading.Thread.Sleep(200);
    }
}
