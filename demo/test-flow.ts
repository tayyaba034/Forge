const relayUrl = process.env.FORGE_RELAY_URL ?? 'http://localhost:9902';

type ToolResponse<T = unknown> = {
  ok: boolean;
  result?: T;
  error?: string;
};

async function callTool<T = unknown>(tool: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`${relayUrl}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  const data = (await response.json()) as ToolResponse<T>;

  if (!response.ok || !data.ok) {
    throw new Error(`${tool} failed: ${data.error ?? response.statusText}`);
  }

  return data.result as T;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`[FORGE test-flow] Relay: ${relayUrl}`);

  const scene = await callTool<{ objects?: Array<{ path: string }> }>('get_scene_state');
  const hasPlayer = JSON.stringify(scene).includes('"Player"');
  assert(hasPlayer, 'Expected sample scene to contain a Player GameObject.');
  console.log('1. Scene read: Player found');

  const healthCode = `using UnityEngine;
using UnityEngine.Events;

public class HealthSystem : MonoBehaviour
{
    [Header("Health Settings")]
    public float maxHealth = 100f;
    public float currentHealth;

    [Header("Events")]
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
`;

  const created = await callTool<{ filePath: string; compileErrors: string[] }>('create_script', {
    fileName: 'HealthSystem',
    code: healthCode,
  });
  assert(created.filePath === 'Assets/Scripts/HealthSystem.cs', 'Expected HealthSystem.cs to be created.');
  assert(created.compileErrors.length === 0, `Expected no compile errors: ${created.compileErrors.join(', ')}`);
  console.log('2. HealthSystem.cs created');

  const attached = await callTool<{ attached: boolean }>('set_component_property', {
    gameObjectPath: 'Player',
    componentType: 'HealthSystem',
    property: 'maxHealth',
    value: '100',
  });
  assert(attached.attached, 'Expected HealthSystem to be attached to Player.');
  console.log('3. HealthSystem attached/configured');

  const errors = await callTool<string[]>('get_compile_errors');
  assert(errors.length === 0, `Expected final compile check to pass: ${errors.join(', ')}`);
  console.log('4. Final compile check passed');
}

main().catch((error) => {
  console.error(`[FORGE test-flow] ${error.message}`);
  process.exit(1);
});
