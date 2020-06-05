# Simularium Viewer

npm package to view simularium trajectories
https://www.npmjs.com/package/@aics/simularium-viewer

---

## Description
This viewer can visualize trajectories that are in the Simularium Visualization-Data-Format. The viewer can operate in the following modes:

**drag-and-drop**  
Drag a Simularium Visualization-Data-Format file into the window (WebGL) area of the viewer.

**remote-streaming**  
Connect to a [simularium-engine](https://github.com/allen-cell-animated/simularium-engine) instance, and stream data through a web-socket connection.

## Installation

1. Run `npm install` to install the dependencies.
2. Run `./gradlew start`
3. Navigate to http://localhost:8080/public/

This will run the example in `/examples/Viewer.tsx`, demonstrating the viewer's functionality.

## Documentation

If you have more extensive technical documentation (whether generated or not), ensure they are published to the following address:
For full package documentation please visit
[organization.github.io/projectname](https://organization.github.io/projectname/index.html).

## Quick Start

| script | comments |
| ------ | -------- |
| build  | create CommonJS, ES module, and UMD builds |
| bundle | run Webpack to create a UMD bundle |
| clean | remove generated artifacts |
| format | run prettier on `src` directory |
| generateTypes | generate type declarations |
| lint | run eslint on `src` directory |
| transpileCommonJs | run babel on `src` directory; transpile `import/export` statements for a CommonJS compatible build |
| transpileES |  run babel on `src` directory; *do not* transpile `import/export` statements for an ES module compatible build (used by bundlers for tree-shaking) |
| test | run `mocha`; searches for any files matching the pattern "src/**/*.test.js" |
| typeCheck | run `tsc` in type-check only mode |
| start  | runs an example app from `examples` for testing. Runs at `localhost:8080/public/`. Run ./gradlew build to see new changes from `src` |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for information related to developing the code.
