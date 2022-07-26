class BridgePlugin {
    constructor(options) {
        this._options = options;
    }

    apply(compiler) {
        const webpack = compiler.webpack;
        compiler.hooks.thisCompilation.tap('bridge-plugin', (compilation) => {
            compilation.hooks.processAssets.tapAsync({
                name: 'bridge-plugin',
                stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
            }, (assets, callback) => {
                const assetManifest = {
                    js: [],
                    css: []
                }
                const prefix = this._options.prefix || '';
                const projectName = this._options.projectName;
                compilation.entrypoints.forEach(entrypoint => {
                    const assets = entrypoint.getFiles();
                    assets.forEach(asset => {
                        const fagment = asset.split('.');
                        const key = fagment[fagment.length - 1];
                        const list = assetManifest[key];
                        if (!list) return;
                        list.push(asset);
                    })
                });

                ['js', 'css'].forEach(key => {
                    const opt = this._options[key] || {};
                    if (opt.files instanceof Array) {
                        assetManifest[key] = opt.files.concat(assetManifest[key])
                    }
                    if (opt.exclude instanceof Array) {
                        assetManifest[key] = assetManifest[key].filter(file => !opt.exclude.find(rule => {
                            if (rule instanceof RegExp) {
                                return rule.test(file)
                            } else if (typeof rule === 'string') {
                                return rule === file
                            }
                        }))
                    }
                    if (opt.sort) {
                        assetManifest[key].sort(opt.sort);
                    }
                    assetManifest[key] = assetManifest[key].map(file => prefix + file)
                })
                assetManifest.js = Array.from(new Set(assetManifest.js));
                assetManifest.css = Array.from(new Set(assetManifest.css)); 

                compilation.emitAsset('loadChunks.js', new webpack.sources.RawSource(`
                    window.$mcrBridge.instance.loadProjectJsonp('${projectName}', ${JSON.stringify(assetManifest)});
                `, false))
                callback()
            })
        })
    }
}

module.exports = BridgePlugin;