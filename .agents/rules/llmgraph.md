# MANDATORY RULE: ALWAYS USE LLMGRAPH FOR CODEBASE INTELLIGENCE

## Absolute Rule
You MUST ALWAYS use **LLMGRAPH** (`C:\Users\abhit\Documents\Lab\LLMGRAPH`) to understand the codebase, analyze call graphs, inspect symbol relationships, trace execution paths, calculate blast radius, find choke points, and disambiguate types BEFORE and DURING any feature work, bug fixes, or refactoring.

## LLMGraph CLI Environment
- **Root Directory**: `C:\Users\abhit\Documents\Lab\LLMGRAPH`
- **Python Binary**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe`
- **CLI Script**: `C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py`

## Common LLMGraph Workflows

### 1. Build / Incremental Sync Index
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py build --repo C:\Users\abhit\Documents\adlabs --name adlabs --force
```

### 2. Reverse Blast Radius (Impact Analysis)
Before touching or refactoring any function or component:
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py blast <symbol> --name adlabs --depth 3
```

### 3. Execution Paths (Yen's Top-K Shortest Paths)
To trace how a request flows from an entry point to a database or storage function:
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py paths <source_symbol> <target_symbol> --k 3 --name adlabs
```

### 4. Choke Point & Dominator Analysis
To identify critical bottleneck functions in an execution flow:
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py chokepoints <source_symbol> <target_symbol> --name adlabs
```

### 5. Callers & Callees
To inspect exact callers or callees of any symbol:
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py callers <symbol> --name adlabs
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py callees <symbol> --name adlabs
```

### 6. Active Type Disambiguation
To resolve polymorphic or multi-candidate symbol bindings:
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py disambiguate <symbol> --name adlabs
```

### 7. Database Verification & Stats
```bash
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py stats
C:\Users\abhit\Documents\Lab\LLMGRAPH\.venv\Scripts\python.exe C:\Users\abhit\Documents\Lab\LLMGRAPH\graph.py verify
```

## Doctrine
Manual grep / text guessing is NEVER an acceptable substitute for deterministic AST-proven call intelligence. Always index and query LLMGraph.
