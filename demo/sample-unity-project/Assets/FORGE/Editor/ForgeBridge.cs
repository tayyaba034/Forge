using UnityEditor;
using UnityEngine;

public class ForgeBridge : EditorWindow
{
    [MenuItem("Window/FORGE Bridge")]
    public static void ShowWindow()
    {
        GetWindow<ForgeBridge>("FORGE Bridge");
    }

    void OnGUI()
    {
        GUILayout.Label("FORGE Unity Bridge", EditorStyles.boldLabel);
        EditorGUILayout.Space();

        var status = ForgeWebSocketServer.IsListening ? "Listening" : "Stopped";
        var color = ForgeWebSocketServer.IsListening ? Color.green : Color.red;

        var previousColor = GUI.color;
        GUI.color = color;
        EditorGUILayout.LabelField("Status", status);
        GUI.color = previousColor;

        EditorGUILayout.LabelField("URL", "ws://localhost:9901/forge/");
        EditorGUILayout.Space();

        if (GUILayout.Button("Start Bridge"))
        {
            ForgeWebSocketServer.Start();
        }

        if (GUILayout.Button("Open Chat"))
        {
            ForgeChatWindow.ShowWindow();
        }

        EditorGUILayout.HelpBox(
            "Start the Node relay on port 9902, then use the web app or open Window > FORGE Chat for the local editor chat.",
            MessageType.Info
        );
    }
}
