# Providers

## How provider support works

Claude Code speaks **Anthropic API format** exclusively. When you point it at a different provider via `ANTHROPIC_BASE_URL`, that provider must understand Anthropic-format requests.

Not all providers do. Some speak **OpenAI format** only.

### Anthropic format vs OpenAI format

The two formats differ in endpoint path, request shape, response shape, and — critically — tool call schema. Claude Code relies heavily on tool calls (file read/write, bash, etc.), so format mismatches break agentic behavior.

**Request:**

```
# Anthropic
POST /v1/messages
x-api-key: <key>
anthropic-version: 2023-06-01

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "system": "You are helpful.",
  "messages": [{"role": "user", "content": "hi"}]
}

# OpenAI
POST /v1/chat/completions
Authorization: Bearer <key>

{
  "model": "gpt-4",
  "max_tokens": 1024,
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "hi"}
  ]
}
```

**Response:**

```
# Anthropic
{
  "type": "message",
  "content": [{"type": "text", "text": "Hi!"}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 5}
}

# OpenAI
{
  "choices": [{"message": {"role": "assistant", "content": "Hi!"}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 10, "completion_tokens": 5}
}
```

**Tool use — the critical difference:**

```
# Anthropic
"tools": [{"name": "bash", "input_schema": {"type": "object", "properties": {...}}}]

// tool call in response:
{"type": "tool_use", "id": "toolu_123", "name": "bash", "input": {...}}

// tool result sent back:
{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_123", "content": "..."}]}

# OpenAI
"tools": [{"type": "function", "function": {"name": "bash", "parameters": {...}}}]

// tool call in response:
{"tool_calls": [{"id": "call_123", "type": "function", "function": {"name": "bash", "arguments": "{...}"}}]}

// tool result sent back:
{"role": "tool", "tool_call_id": "call_123", "content": "..."}
```

| | Anthropic | OpenAI |
|--|-----------|--------|
| Endpoint | `/v1/messages` | `/v1/chat/completions` |
| System prompt | top-level `system` field | `role: system` message in array |
| Response wrapper | `content[]` typed blocks | `choices[].message.content` string |
| Tool definition key | `input_schema` | `function.parameters` |
| Tool response type | `type: tool_use` + `input` | `tool_calls` + `function.arguments` |
| Tool result role | `user` with `tool_result` block | `tool` role |
| Stop signal | `stop_reason: end_turn` | `finish_reason: stop` |

---

## Providers that work directly with Claude Code

These have native Anthropic-compatible endpoints — no proxy needed. helo writes the `"env"` block in `settings.json` and launches.

| Provider | Base URL | Key type |
|----------|----------|----------|
| `anthropic` | — | None (subscription, browser login) |
| `anthropic-api` | — | `ANTHROPIC_API_KEY` |
| `zai-anthropic` | `https://api.z.ai/api/anthropic` | Plan key |
| `openrouter` | `https://openrouter.ai/api` | `sk-or-v1-...` |
| `deepseek` | `https://api.deepseek.com/anthropic` | `sk-...` |

> `openrouter` and `deepseek` tested directly — Anthropic-format requests confirmed working.

## Providers that need a proxy (OpenAI-format only)

These do not have Anthropic-compatible endpoints. Use [claude-code-router](https://github.com/musistudio/claude-code-router) (CCR) as a local proxy, then point helo at `http://localhost:3456`.

| Provider | Endpoint |
|----------|----------|
| `vultr` | `https://api.vultrinference.com/v1` |
| `groq` | — |
| `mistral` | — |
| `together` | — |
| `cerebras` | — |
| `ollama` | `http://localhost:11434/v1` |

CCR handles the Anthropic→OpenAI translation and provider-specific quirks (tool call format, streaming, token limits).

## Model quality vs API compatibility

API compatibility only determines whether the connection works. Model quality determines how well Claude Code functions.

- **OpenRouter with Claude models** (`anthropic/claude-sonnet-4-6` etc.) — identical to direct Anthropic. Routes to Anthropic infrastructure.
- **OpenRouter with non-Claude models** — API works, tool use quality varies by model.
- **DeepSeek models** — tool use supported but not Claude-level for complex agentic tasks.

Provider sets the endpoint. Model sets the capability.
