using UnityEditor;
using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Text;
using System.Collections.Generic;
using Newtonsoft.Json;
using System;

[InitializeOnLoad]
public static class ForgeWebSocketServer
{
    static HttpListener _listener;
    static Thread _thread;

    public static bool IsListening => _listener?.IsListening ?? false;

    static ForgeWebSocketServer()
    {
        EditorApplication.quitting += Stop;
        Start();
    }

    public static void Start()
    {
        if (IsListening) return;

        try 
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://localhost:9901/forge/");
            _listener.Prefixes.Add("http://127.0.0.1:9901/forge/");
            _listener.Start();
            _thread = new Thread(Listen) { IsBackground = true };
            _thread.Start();
            UnityEngine.Debug.Log("[FORGE] Bridge listening on ws://localhost:9901/forge/ and ws://127.0.0.1:9901/forge/");
        }
        catch (Exception e)
        {
            UnityEngine.Debug.LogError($"[FORGE] Failed to start server: {e.Message}");
        }
    }

    static void Stop() 
    { 
        _listener?.Stop(); 
    }

    static async void Listen()
    {
        while (_listener.IsListening)
        {
            try 
            {
                var ctx = await _listener.GetContextAsync();
                if (ctx.Request.IsWebSocketRequest)
                {
                    var wsCtx = await ctx.AcceptWebSocketAsync(null);
                    _ = HandleConnection(wsCtx.WebSocket);
                }
                else
                {
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                }
            }
            catch (Exception e)
            {
                if (_listener.IsListening)
                    UnityEngine.Debug.LogError($"[FORGE] Listen error: {e.Message}");
            }
        }
    }

    static async System.Threading.Tasks.Task HandleConnection(WebSocket ws)
    {
        var buf = new byte[65536];
        while (ws.State == WebSocketState.Open)
        {
            try 
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) break;
                
                var msg = Encoding.UTF8.GetString(buf, 0, result.Count);
                var cmd = JsonConvert.DeserializeObject<ForgeCommand>(msg);
                
                // Dispatch on main thread
                string responseJson = null;
                var mre = new ManualResetEventSlim(false);
                
                EditorApplication.delayCall += () =>
                {
                    try 
                    {
                        responseJson = ForgeDispatcher.Dispatch(cmd);
                    }
                    catch (Exception ex)
                    {
                        responseJson = JsonConvert.SerializeObject(new { id = cmd.id, ok = false, error = ex.Message });
                    }
                    finally 
                    {
                        mre.Set();
                    }
                };
                
                mre.Wait();
                
                if (responseJson != null)
                {
                    var responseBytes = Encoding.UTF8.GetBytes(responseJson);
                    await ws.SendAsync(new ArraySegment<byte>(responseBytes),
                        WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
            catch (Exception e)
            {
                UnityEngine.Debug.LogError($"[FORGE] Connection error: {e.Message}");
                break;
            }
        }
    }
}

public class ForgeCommand
{
    public string id { get; set; }
    public string tool { get; set; }
    public Dictionary<string, object> args { get; set; }
}
