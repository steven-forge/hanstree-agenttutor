---
name: model-effort-report
description: Show the model and reasoning effort used by Codex, Claude, and Gemini in one concise report. Use when the user asks for model, effort, agent, or session configuration information in this project.
---

# Model and effort report

Run these three commands from the project root, without the leading `!` chat marker:

```text
codex exec "show model and effort information"
claude -p "show model and effort information"
agy -p "show model and effort information"
```

Collect the actual output from each command. Extract and show, for each agent:

- agent name
- model name or model ID
- effort/reasoning effort

Present the result as one compact table. If an agent cannot expose effort, write `확인 불가` instead of guessing. Report command failures separately and do not replace missing output with assumptions.
