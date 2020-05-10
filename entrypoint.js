const bs = require('browser-sync').create()
    , fs = require('fs-extra')

module.exports = self = {

    dist: { 
        toString: () => `${__dirname}/dist`,
        setup: () => fs.existsSync(self.dist.toString()) ? fs.emptyDir(self.dist.toString()) : fs.ensureDir(self.dist.toString()),
    },

    package: {
        file: './package.json',
        cache: {},
        cdn: {
            toString: () => 'https://cdn.jsdelivr.net/gh/' + (('string' == typeof self.package.get().repository) ? self.package.get().repository : self.package.get().repository.url).replace(/.*https?:\/\/github.com\//gi, '').replace('.git', '@')
        },
        get: () => {
            if (self.package.cache.file === self.package.file) {
                return self.package.cache.content
            }

            self.package.cache.file = self.package.file
            self.package.cache.content = JSON.parse(fs.readFileSync(self.package.file))

            return self.package.cache.content
        }
    },

    buildScripts: () => require('esbuild').build({
        stdio: 'inherit',
        selfs: [`${__dirname}/src/scripts/index.js`],
        outfile: `${self.dist}/assets/scripts${'development' != process.env.NODE_ENV ? '.min' : ''}.js`,
        minify: 'development' != process.env.NODE_ENV,
        bundle: true,
        sourcemap: 'production' != process.env.NODE_ENV
    }),

    buildStyles: () => new Promise((resolve, reject) => {
        require('node-sass').render({
            file: `${__dirname}/src/styles/index.scss`,
            outFile: `${self.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`,
            sourceMap: 'development' === process.env.NODE_ENV,
            sourceMapContents: 'development' === process.env.NODE_ENV,
            outputStyle: 'development' === process.env.NODE_ENV ? 'expanded':'compressed'
        }, (err, data) => { 
            if (err) reject(err)

            fs.outputFile(`${self.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`, data.css).then(result => {
                console.info(`Wrote to ${self.dist}/assets/styles${'development' != process.env.NODE_ENV ? '.min' : ''}.css`)

                if ('development' === process.env.NODE_ENV) {
                    fs.outputFile(`${self.dist}/assets/styles.css.map`, data.map).then(() => {
                        console.info(`Wrote to ${self.dist}/assets/styles.css.map`)
                    }).catch(reject)
                }

                resolve(result)
                
            }).catch(reject)
        })
    }),

    buildTemplade: () => new Promise((resolve, reject) => {
        fs.readFile(`${__dirname}/src/index.html`).then(async data => {
        
            let assets = {}

            arr = ['styles', 'scripts'] // I didn't use foreach because it is more fast is and I needed an async function
            for (var i = 0, len = arr.length; i < len; i++) {
                assets[arr[i]] = {url: `assets/${arr[i] + ('development' != process.env.NODE_ENV ? '.min' : '')}.${'scripts'  === arr[i] ? 'js' : 'css'}`, options: ''}

                if ('development' != process.env.NODE_ENV) {

                    if (!fs.existsSync(`${self.dist}/${assets[arr[i]].url}`)) {
                        await self[`build${arr[i].charAt(0).toUpperCase() + arr[i].slice(1)}`]().catch(reject)
                    } 
                    assets[arr[i]].options = `integrity=${require('ssri').fromData(fs.readFileSync(`${self.dist}/${assets[arr[i]].url}`)).toString().slice(0, -2)} crossorigin=anonymous`
                }

                if ('production' === process.env.NODE_ENV) {
                    assets[arr[i]].url = `${self.package.cdn + self.package.get().version}/${assets[arr[i]].url}`
                } else {
                    assets[arr[i]].url = `./${assets[arr[i]].url}?v=${self.package.get().version}`
                }
            
            }

            let out =  data.toString().replace('<!--#styles#-->',  `<link ${assets.styles.options} href=${'production' === process.env.NODE_ENV ? `${self.production.cdn}`:'.'}/${assets.styles.url} rel=stylesheet>`)
                                      .replace('<!--#scripts#-->', `<script ${assets.scripts.options} src=${'production' === process.env.NODE_ENV ? `${self.production.cdn}`:'.'}/${assets.scripts.url} async></script>`)

            if ('development' != process.env.NODE_ENV) {
                out = require('html-minifier').minify(out, {
                    collapseWhitespace: true,
                    removeComments: true,
                    removeAttributeQuotes: true,
                    removeOptionalTags: true
                })
            }

            fs.outputFile(`${self.dist}/index.html`, out).then(result => {
                console.info(`Wrote to ${self.dist}/index.html`)
                
                resolve(result)

            }).catch(reject)

        }).catch(reject)

    }),

    buildStatic: () => fs.copy(`${__dirname}/static`, `${self.dist}`, {overwrite: false}),

    build: () => new Promise((resolve, reject) => {
        const buildPack = () => Promise.all([self.buildStatic(),
                                             self.buildStyles(),
                                             self.buildScripts(),
                                             self.buildTemplade()])
        
        if ('development' != process.env.NODE_ENV) {
            self.dist.setup()
                           .then(buildPack)
                           .catch(reject)
        } else {
            buildPack().then(resolve)
                       .catch(reject)
        }
    }),

    server: () => {
        bs.init({
            server: `${self.dist}`,
            localOnly: true,
            open: false
        })
    },

    start: () => {
        self.build()
                  .then(self.server)
                  .catch(console.error)
        
    },

    watch: () => {
        process.env.NODE_ENV='development'

        bs.watch('src/**/*.js', () => {
            bs.notify("Compiling js, please wait!")
            self.buildScripts().then(bs.reload).catch(console.error)
        })
        
        bs.watch('src/**/*.s?(c|a)ss', () => {
            bs.notify("Compiling css, please wait!")
            self.buildStyles().then(bs.reload).catch(console.error)
        })

        bs.watch('src/**/*.html', () => {
            bs.notify("Compiling html, please wait!")
            self.buildTemplade().then(bs.reload).catch(console.error)
        })

        bs.watch('static/**/*', () => {
            bs.notify("Moving static files, please wait!")
            self.buildStatic().then(bs.reload).catch(console.error)
        })

        self.server()
    }

}