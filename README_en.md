# Open Orpheus

An open-source implementation of Netease Cloud Music's Orpheus browser host.

Track the project's current dev plans at https://github.com/users/YUCLing/projects/2

## Features

- Cross-platform support
- Open-source

What else do you expect! It just provides a environment for the original client!

## Installation

Uhh, this project is not end-user ready now! Sorry!

## Development

You will need Node and Rust to work with this project.

For root project, everything works just like any other Electron Forge project, but Open Orpheus has some its own native modules, it requires a few more steps to setup.

In the following steps, `pnpm` will be used as Node's package manager.

### Setup

#### Install dependencies

Run this once at the root — pnpm workspaces will install dependencies for all packages including native modules:

```sh
pnpm install
```

#### Build modules

Inside `modules` folder, there are a few native modules that Open Orpheus require to run.

Enter each submodule's folder and build:

```sh
pnpm build # Build the module (will build both Rust and Node code)
```

### Resources

This project does not bundle some required resources because they are owned by NetEase.

Open Orpheus will **automatically download** the package from NetEase's CDN on first launch if it is missing, so manual setup is usually not required.

Resources are stored in the `package` subfolder of the data directory:

- Development: `data/package/` (relative to working directory)
- Packaged: `{userData}/package/`

#### `package` folder

The entire `package` folder is required.

If the automatic download fails, you can manually copy the entire `package` folder from your official NetEase Cloud Music installation (e.g. `C:\path\to\your\installation\CloudMusic\package`) into the data directory above.

#### `web.pack` file (optional)

An updated web resource pack produced by the official NetEase Cloud Music client, found at `C:\Users\<YOUR_USERNAME>\AppData\Local\NetEase\CloudMusic\web.pack`. Copy it into the `package` folder alongside `orpheus.ntpk`. If present, Open Orpheus will prefer it over `orpheus.ntpk`.

It is generally not recommended to use a too-recent web resource pack, as it may cause compatibility issues.

## Disclaimer

Open Orpheus is an independent open-source project aimed at **interoperability**. It is not affiliated with, authorized by, or endorsed by NetEase in any way.

- **This project does not include or distribute any assets or code owned by NetEase.** Required resources such as `orpheus.ntpk` are the property of NetEase. Users must obtain them from a legally acquired official client installation, or allow the application to download them automatically from NetEase's official CDN on first launch.
- **This project does not provide, encourage, or support any functionality or modification intended to bypass advertisements, paid content, membership benefits, or digital rights management (DRM) mechanisms.** Any such use is explicitly outside the scope of this project and will be actively rejected.
- By using this project, you remain bound by the [NetEase Cloud Music Terms of Service](https://st.music.163.com/official-terms/service) and all applicable laws and regulations.
- This project is provided "as is". The maintainers accept no responsibility for any consequences arising from its use, including but not limited to account suspension, service disruption, or legal liability.

> "NetEase Cloud Music", "Orpheus", and related trademarks are the property of NetEase, Inc.
