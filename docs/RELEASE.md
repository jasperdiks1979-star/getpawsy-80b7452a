# Release Configuration

## Automated Releases

This project uses automated semantic versioning based on conventional commits.

### How It Works

1. **Commit Messages** determine the version bump:
   - `feat:` → Minor version bump (1.0.0 → 1.1.0)
   - `fix:` / `perf:` → Patch version bump (1.0.0 → 1.0.1)
   - `feat!:` or `BREAKING CHANGE:` → Major version bump (1.0.0 → 2.0.0)

2. **Automatic Triggers**:
   - Pushes to `main` or `master` branch trigger release analysis
   - Manual releases can be triggered via GitHub Actions

3. **Release Artifacts**:
   - Git tag (e.g., `v1.2.3`)
   - GitHub Release with auto-generated notes
   - Updated CHANGELOG.md

### Manual Release

To trigger a manual release:

1. Go to Actions → Release workflow
2. Click "Run workflow"
3. Select release type (patch, minor, major)
4. Click "Run workflow"

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Test changes
- `build` - Build system changes
- `ci` - CI/CD changes
- `chore` - Maintenance tasks
- `revert` - Revert a commit

**Examples:**
```
feat(cart): add quantity selector to cart items
fix(checkout): resolve payment processing timeout
perf(products): optimize image loading with lazy loading
docs: update API documentation
feat!: redesign authentication flow (BREAKING CHANGE)
```
