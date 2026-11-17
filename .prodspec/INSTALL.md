# Installing Spec Kit CLI (Optional)

If you want to use the Spec Kit CLI for automated workflows, you can install it via npm:

```bash
npm install -g @spec-kit/cli
```

Or use it via npx without installation:

```bash
npx @spec-kit/cli init
```

## Alternative: Python-based Installation

If npm installation fails, you can use the Python uv tool:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

## Manual Workflow

This project includes a manual ProdSpec structure that works without the CLI:

- Create specs in `.prodspec/specs/<feature name>/spec.md`
- Write plans in `.prodspec/specs/<feature name>/plan.md` (include task breakdown at end)

See the main README.md in this directory for templates and workflow details.
