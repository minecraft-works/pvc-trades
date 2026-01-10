## git conventions

- Use descriptive commit messages.
- Follow the branching strategy (e.g., feature branches, bugfix branches).

### Conventional Commits

Use conventional commit messages for automated versioning. The commit message format is:

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `docs:` - Documentation only
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `ci:` - CI/CD changes

**Breaking Changes:**
Add `!` after type or include `BREAKING CHANGE:` in the footer for major version bump:

```
feat!: change API endpoint
# or
feat: change API endpoint

BREAKING CHANGE: This changes the endpoint structure
```