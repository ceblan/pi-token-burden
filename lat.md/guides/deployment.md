# Deployment

Install, local development, and release steps for the extension.

## Install

Install the extension from npm, git, or a local symlink.

```bash
# Install from npm
pi install npm:pi-token-burden

# Install from git
pi install git:github.com/Whamp/pi-token-burden

# Or try for a single session
pi -e git:github.com/Whamp/pi-token-burden

# Local dev: symlink into global extensions
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-token-burden
```

## Releasing

Bump, tag, and publish a release.

```bash
npm version patch   # bumps version, updates CHANGELOG.md, commits, tags
git push --tags && git push
npm publish
```

The `version` script runs changelogen automatically to update `CHANGELOG.md` before the version commit. Use `patch`, `minor`, or `major` as appropriate.
