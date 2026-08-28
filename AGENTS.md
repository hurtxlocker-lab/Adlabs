<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MANDATORY RULE: ALWAYS USE LLMGRAPH FOR CODEBASE INTELLIGENCE

Before making modifications, tracing execution paths, analyzing blast radius, resolving symbol dependencies, finding choke points, or fixing bugs, you MUST ALWAYS use **LLMGRAPH** (`C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py` with Python `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe`).

- **Index/Sync**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py build --repo C:\Users\abhit\Documents\adlabs --name adlabs --force`
- **Blast Radius**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py blast <symbol> --name adlabs --depth 3`
- **Execution Paths**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py paths <src> <dst> --k 3 --name adlabs`
- **Callers / Callees**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py callers <symbol> --name adlabs`
- **Choke Points**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py chokepoints <src> <dst> --name adlabs`
- **Stats / Verify**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py stats`

