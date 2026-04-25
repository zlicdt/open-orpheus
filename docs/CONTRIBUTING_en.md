# Contributing to Open Orpheus

[中文版](./CONTRIBUTING.md)

First off, thank you for taking the time to contribute to Open Orpheus! Whether it's filing a bug report, improving documentation, or submitting code, every contribution matters.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Submitting Issues](#submitting-issues)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Development Setup](#development-setup)

## Code of Conduct

Please be kind and respectful in all interactions. We want Open Orpheus to be a welcoming community for everyone. See [CODE_OF_CONDUCT_en.md](./CODE_OF_CONDUCT_en.md) for the full text.

## Submitting Issues

Issues are the main channel for reporting bugs, suggesting features, and discussing the project's direction. Before opening a new issue, please search existing ones to avoid duplicates.

### Reporting Bugs

Please include as much of the following as possible:

- **OS and version** (e.g. Fedora 42, Windows 11)
- **Desktop environment** (if on Linux)
- **Open Orpheus version**
- **Steps to reproduce** — the minimal steps that reliably trigger the issue
- **Expected behavior** vs **actual behavior**
- **Relevant logs or screenshots** (if applicable)

> Do not include account credentials or any private information in issues.

### Feature Requests

Ideas for new features are welcome! Please describe:

- What you'd like to see
- Who would benefit from it
- Whether you'd be willing to help implement it

Note that the core goal of this project is **interoperability**. Features intended to bypass ads, paid content, or DRM will not be accepted.

## Submitting Pull Requests

1. Fork the repository and create your branch from `main` (e.g. `feat/my-feature` or `fix/some-bug`).
2. Make your changes and verify the project builds and runs correctly.
3. Write a clear PR description explaining what you changed and why.
4. If your PR addresses an issue, reference it with `Closes #issue-number` in the description.
5. Submit and wait for review. Maintainers may request changes — please be patient.

### Code Style

- TypeScript / JavaScript: The project uses ESLint. Make sure there are no lint errors before submitting (`pnpm lint`).
- Rust: Follow standard `rustfmt` style (`cargo fmt`).
- Commit messages should be in English. The [Conventional Commits](https://www.conventionalcommits.org/) format is recommended.

## Development Setup

You will need Node and Rust to work with this project (Node v24 and Rust 1.92 are recommended).

For the root project, everything works just like any other Electron Forge project, but Open Orpheus has some native modules of its own, which require a few extra setup steps.

In the following steps, `pnpm` will be used as Node's package manager. Other package managers are not recommended.

### Install Dependencies

Run this once at the root — pnpm workspaces will install dependencies for all packages including native modules:

```sh
pnpm install
```

### Build Modules

Inside `modules` folder, there are a few native modules that Open Orpheus requires to run.

Run from the root directory:

```sh
pnpm build:modules # Build all modules (will build both Rust and Node code)
```

### Start Development Mode

```sh
pnpm start
```

This launches the Electron app in development mode with hot reload for the renderer.
