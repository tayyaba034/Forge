# FORGE Sample Unity Project

Open this folder from Unity Hub after installing Unity 6 or a recent 2022/2023 LTS Editor.

Once Unity opens:

1. Create a new scene if Unity does not create one automatically.
2. Add an empty GameObject named `Player`.
3. Copy `packages/bridge/Editor` from this repo into `Assets/FORGE/Editor`, or add `packages/bridge` as a local package in Package Manager.
4. Open `Window > FORGE Bridge` and confirm the bridge is listening.
5. Run the relay and web app from the repo root.

The smoke test expects a scene containing a GameObject named `Player`.
