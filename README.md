# Azeroth Token Forge

A character builder inspired by **Hero Forge**, using **World of Warcraft** models, armor and weapons. Build a hero for your campaign, explore familiar NPCs and creatures, and turn them into tabletop tokens.

The viewer is forked from [Miorey’s WoW Model Viewer](https://github.com/Miorey/wow-model-viewer), which uses the Wowhead/Zam model viewer. This project builds a character workshop around it, with visual equipment browsing, NPC previews and token exports.

You can:

- Customize playable races, faces, hair and body details.
- Browse armor, weapons and their color variations.
- Preview existing NPCs, creatures and bosses, and change equipment on supported models.
- Choose poses, rotate the model and frame your token from above or at an angle.
- Export transparent PNG tokens at 512 or 1024 pixels.
- Add a crisp outline, a soft colored glow or a cast shadow with adjustable opacity.
- Export transparent animated WebM and WebP tokens, including poses and equipment effects.
- Undo changes and move character builds between computers using JSON files.

## Try it locally

On Windows, double-click **[Launch Token Forge.cmd](Launch%20Token%20Forge.cmd)**. It sets up the tools it needs and opens the app in your browser. Use **[Stop Token Forge.cmd](Stop%20Token%20Forge.cmd)** to stop it.

With Node.js 24 installed:

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173). Internet access is needed to download models and textures; no WoW installation is required.

## Online version and accounts

GitHub Pages deployment is prepared for the interface. The online workshop still needs its cloud connection before it is ready to use. See the [deployment guide](app/DEPLOYMENT.md).

Cloud accounts are the next step: username/password login, an online character library, autosave, **Save as copy**, and share links that require sign-in and show the latest saved build. Recipients will be able to save their own copy. These are planned, not connected yet. The current version keeps a browser draft; use **Save JSON** in the top bar to keep a character file. See the [cloud plan](app/CLOUD-PLAN.md) for the proposed setup.

More usage details are in the [application guide](app/README.md).

## Credits

Inspired by Hero Forge; this is an independent fan project. World of Warcraft assets belong to Blizzard Entertainment. Viewer and asset delivery are provided through Wowhead/Zam and the original WoW Model Viewer project. This project is not affiliated with Hero Forge, Blizzard, Wowhead or Zam.
