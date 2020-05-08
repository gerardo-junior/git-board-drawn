const bs = require('browser-sync').create()
    , fs = require('fs-extra')

module.exports = entrypoint = {

    dist: { 
        toString: () => `${__dirname}/dist`,
        setup: () => fs.existsSync(entrypoint.dist.toString()) ? fs.emptyDir(entrypoint.dist.toString()) : fs.ensureDir(entrypoint.dist.toString()),
    },

    buildJS: () => require('esbuild').build({
        stdio: 'inherit',
        entryPoints: [`${__dirname}/src/scripts/index.js`],
        outfile: `${entrypoint.dist}/assets/scripts${'development' != process.env.NODE_ENV ? '.min' : ''}.js`,
        minify: 'development' != process.env.NODE_ENV,
        bundle: true,
        sourcemap: 'development' === process.env.NODE_ENV
    }),

    buildCSS: () => new Promise((resolve, reject) => {
        require('node-sass').render({
            file: `${__dirname}/src/styles/index.scss`,
            outFile: `${entrypoint.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`,
            sourceMap: 'development' === process.env.NODE_ENV,
            sourceMapContents: 'development' === process.env.NODE_ENV,
            outputStyle: 'development' === process.env.NODE_ENV ? 'expanded':'compressed'
        }, (err, result) => { 
            if (err) reject(err)

            fs.outputFile(`${entrypoint.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`, result.css).then(() => {
                console.log(`Wrote to ${entrypoint.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`)

                if ('development' === process.env.NODE_ENV) {
                    fs.outputFile(`${entrypoint.dist}/assets/styles.css.map`, result.map).then(() => {
                        console.log(`Wrote to ${entrypoint.dist}/assets/styles.css.map`)
                    }).catch(err => reject(err))
                }

                resolve(true)
                
            }).catch(err => reject(err))
        })
    }),

    buildHTML: () => new Promise((resolve, reject) => {
        fs.readFile(`${__dirname}/src/index.html`).then(async data => {
        
            let assets = { styles: {url: `assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`, options: 'rel=stylesheet'},
                           scripts: {url: `assets/scripts${'development' != process.env.NODE_ENV ? '.min' : ''}.js`, options: 'async'}}

            if ('development' != process.env.NODE_ENV) {

                if (!fs.existsSync(`${entrypoint.dist}/${assets.styles.url}`)) {
                    await entrypoint.buildCSS().catch(err => reject(err))
                }
                assets.styles.options += ` integrity=sha256-${require('sha256-file')(`${entrypoint.dist}/${assets.styles.url}`)} crossorigin=anonymous`

                if (!fs.existsSync(`${entrypoint.dist}/${assets.scripts.url}`)) {
                    await entrypoint.buildJS().catch(err => reject(err))
                }
                assets.scripts.options += ` integrity=sha256-${require('sha256-file')(`${entrypoint.dist}/${assets.scripts.url}`)} crossorigin=anonymous`

                jsdelivr = 'https://cdn.jsdelivr.net/gh/gerardo-junior/git-board-drawn@gh-page'

                assets.styles.url = `${jsdelivr}/${assets.styles.url}`
                assets.scripts.url = `${jsdelivr}/${assets.scripts.url}`
            }

            let out =  data.toString().replace('<!--#styles#-->',  `<link ${assets.styles.options} href=${assets.styles.url}>`)
                                      .replace('<!--#scripts#-->', `<script ${assets.scripts.options} src=${assets.scripts.url}></script>`)

            if ('development' != process.env.NODE_ENV) {
                out = require('html-minifier').minify(out, {
                    collapseWhitespace: true,
                    removeComments: true,
                    removeAttributeQuotes: true,
                    removeOptionalTags: true
                })
            }

            fs.outputFile(`${entrypoint.dist}/index.html`, out).then(() => {
                console.log(`Wrote to ${entrypoint.dist}/index.html`)
            }).catch(err => reject(err))

        }).catch(err => reject(err))

    }),

    build: () => new Promise((resolve, reject) => {
        const buildPack = () => new Promise(async (resolve, reject) => {
            await entrypoint.buildCSS().catch(err => reject(err))
            await entrypoint.buildJS().catch(err => reject(err))
            await entrypoint.buildHTML().catch(err => reject(err))
        })

        if ('development' != process.env.NODE_ENV) {
            entrypoint.dist.setup().then(() => {
                buildPack().catch(err => reject(err))
            }).catch(err => reject(err))
        } else {
            buildPack().catch(err => reject(err))
        }
    })

}