const bs = require('browser-sync').create()
    , fs = require('fs-extra')

module.exports = self = {

    dist: { 
        toString: () => `${__dirname}/dist`,
        setup: () => fs.existsSync(self.dist.toString()) ? fs.emptyDir(self.dist.toString()) : fs.ensureDir(self.dist.toString(), { recursive: true }),
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

    environment: () => !process.env.NODE_ENV ? 'development' : process.env.NODE_ENV,

    buildScripts: () => require('esbuild').build({
        stdio: 'inherit',
        entryPoints: [`${__dirname}/src/scripts/index.js`],
        outfile: `${self.dist}/assets/scripts${'production' === self.environment() ? '.min' : ''}.js`,
        minify: 'production' == self.environment(),
        bundle: true,
        sourcemap: 'production' != self.environment()
    }),

    buildStyles: () => new Promise((resolve, reject) => {
        require('node-sass').render({
            file: `${__dirname}/src/styles/index.scss`,
            outFile: `${self.dist}/assets/styles${'production' === self.environment() ? '.min' : ''}.css`,
            sourceMap: 'production' != self.environment(),
            sourceMapContents: 'production' != self.environment(),
            outputStyle: 'production' == self.environment() ? 'compressed' : 'expanded'
        }, (err, data) => { 
            if (err) reject(err)

            fs.outputFile(`${self.dist}/assets/styles${'production' === self.environment() ? '.min' : ''}.css`, data.css).then(result => {
                console.info(`Wrote to ${self.dist}/assets/styles${'production' === self.environment() ? '.min' : ''}.css`)

                if ('production' != self.environment()) {
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
                assets[arr[i]] = {url: `assets/${arr[i] + ('production' === self.environment() ? '.min' : '')}.${'scripts'  === arr[i] ? 'js' : 'css'}`, attributes: ''}

                if ('development' != self.environment()) {

                    if (!fs.existsSync(`${self.dist}/${assets[arr[i]].url}`)) {
                        await self[`build${arr[i].charAt(0).toUpperCase() + arr[i].slice(1)}`]().catch(reject)
                    } 
                    assets[arr[i]].attributes += `integrity="${require('ssri').fromData(fs.readFileSync(`${self.dist}/${assets[arr[i]].url}`))}" crossorigin="anonymous"`
                }

                if ('production' === self.environment()) {
                    assets[arr[i]].url = `${self.package.cdn + self.package.get().version}/${assets[arr[i]].url}`
                } else {
                    assets[arr[i]].url = `./${assets[arr[i]].url}?v=${self.package.get().version}`
                }
            
            }

            let out =  data.toString().replace('<!--#styles#-->',  `<link ${assets.styles.attributes} href="${assets.styles.url}" rel=stylesheet>`)
                                      .replace('<!--#scripts#-->', `<script ${assets.scripts.attributes} src="${assets.scripts.url}" async></script>`)

            if ('production' === self.environment()) {
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
        
        if ('development' != self.environment()) {
            self.dist.setup()
                     .then(() => {buildPack().then(resolve)
                                             .catch(reject)})
                     .catch(reject)
        } else {
            buildPack().then(resolve)
                       .catch(reject)
        }
    }),

    server: () => bs.init({
        server: `${self.dist}`,
        localOnly: true,
        open: false
    }),

    start: () => self.build().then(self.server),

    watch: () => {

        bs.watch('src/**/*.js', () => {
            bs.notify("Compiling js, please wait!")
            self.buildScripts().then(bs.reload)
        })
        
        bs.watch('src/**/*.s?(c|a)ss', () => {
            bs.notify("Compiling css, please wait!")
            self.buildStyles().then(bs.reload)
        })

        bs.watch('src/**/*.html', () => {
            bs.notify("Compiling html, please wait!")
            self.buildTemplade().then(bs.reload)
        })

        bs.watch('static/**/*', () => {
            bs.notify("Moving static files, please wait!")
            self.buildStatic().then(bs.reload)
        })

        self.server()
    }

}