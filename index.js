const express = require('express');
const path = require('path');
const fs = require('fs');
const sass = require('sass');
const sharp = require('sharp');

const { Pool } = require('pg');

const pool = new Pool({
    user: 'GotP',
    host: 'localhost',
    database: 'GotP stock',
    password: '123',
    port: 5432,
});

const app = express();
const PORT = 8080;

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Could not connect to the database:', err.stack);
    }
    console.log('Connected to the database successfully.');
    release();
});
pool.query("SELECT unnest(enum_range(NULL::category)) AS category_name")
    .then(result => {
        app.locals.menu_categories = result.rows.map(row => row.category_name);
        console.log("Categories loaded for menu:", app.locals.menu_categories);
    })
    .catch(err => console.error("Error fetching categories for menu:", err));

const foldersArray = ["temp", "logs", "backup", "uploads"];
for (let folder of foldersArray) {
    let folderPath = path.join(__dirname, folder);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
        console.log(`[System Initialization] Created missing directory: ${folder}`);
    }
}

console.log("__dirname:", __dirname);
console.log("__filename:", __filename);
console.log("process.cwd():", process.cwd());

// const errorData = JSON.parse(fs.readFileSync(path.join(__dirname, 'errors.json'), 'utf8'));
let globalData = {
    errorsObj: null,
    folderScss: path.join(__dirname, 'resources', 'scss'),
    folderCss: path.join(__dirname, 'resources', 'css')
};

// ================================================================== for the step 4 bonus task:
function validateErrorsJson() {
    const jsonPath = path.join(__dirname, 'errors.json');
    // check if it exists
    if (!fs.existsSync(jsonPath)) {
        console.error("Critical: The file errors.json does not exist.");
        process.exit(1);
    }
    // check it as a long string
    const rawJson = fs.readFileSync(jsonPath, 'utf8');
    let objectBlocks = rawJson.split(/[{}]/);
    for (let block of objectBlocks) {
        let keysMatch = [...block.matchAll(/"([^"]+)"\s*:/g)].map(match => match[1]);
        let uniqueKeys = new Set();

        for (let key of keysMatch) {
            if (uniqueKeys.has(key)) {
                console.error(`Duplicate property found in the JSON string: "${key}". Fix it to avoid overwriting data.`);
            }
            uniqueKeys.add(key);
        }
    }

    // then we parse normally
    let parsedData;
    try {
        parsedData = JSON.parse(rawJson);
    } catch (err) {
        console.error("Invalid JSON format. Cannot parse the file.");
        process.exit(1);
    }

    if (!parsedData.error_info || !parsedData.base_path || !parsedData.default_error) {
        console.error("Missing one of the required root properties: 'error_info', 'base_path', or 'default_error'.");
    }

    if (parsedData.default_error) {
        let defErr = parsedData.default_error;
        if (!defErr.title || !defErr.text || !defErr.image) {
            console.error("The 'default_error' object is missing 'title', 'text', or 'image'.");
        }
    }

    let basePathDir = path.join(__dirname, parsedData.base_path || "");
    if (!fs.existsSync(basePathDir)) {
        console.error(`The base path folder (${parsedData.base_path}) does not exist in the file system.`);
    }

    if (fs.existsSync(basePathDir)) {
        let allErrors = [];
        if (parsedData.default_error) allErrors.push(parsedData.default_error);
        if (parsedData.error_info) allErrors = allErrors.concat(parsedData.error_info);

        for (let err of allErrors) {
            if (err.image) {
                let imgPath = path.join(basePathDir, err.image);
                if (!fs.existsSync(imgPath)) {
                    console.error(`The image file "${err.image}" associated with an error does not exist on disk.`);
                }
            }
        }
    }

    //multiple errors with the same identifier
    if (parsedData.error_info) {
        let idCounts = {};

        for (let err of parsedData.error_info) {
            let id = err.identifier;
            if (!idCounts[id]) idCounts[id] = [];
            idCounts[id].push(err);
        }

        for (let id in idCounts) {
            if (idCounts[id].length > 1) {
                let duplicateDetails = idCounts[id].map(e => {
                    let { identifier, ...rest } = e;
                    return JSON.stringify(rest);
                }).join("  ||  ");

                console.error(`Found multiple errors with the exact same identifier (${id}). 
                                 Details of duplicates: ${duplicateDetails}`);
            }
        }
    }
}
validateErrorsJson();


function initErrors() {
    let errorData = JSON.parse(fs.readFileSync(path.join(__dirname, 'errors.json'), 'utf8'));

    errorData.default_error.image = `${errorData.base_path}/${errorData.default_error.image}`;

    for (let error of errorData.error_info) {
        error.image = `${errorData.base_path}/${error.image}`;
    }

    globalData.errorsObj = errorData;
}
initErrors();

function ScssComp(pathScss, pathCss) {
    let absoluteScss = path.isAbsolute(pathScss) ? pathScss : path.join(globalData.folderScss, pathScss);
    let nameScssFile = path.basename(absoluteScss);

    let absoluteCss;
    if (!pathCss) {
        let nameCssFile = nameScssFile.replace('.scss', '.css');
        absoluteCss = path.join(globalData.folderCss, nameCssFile);
    } else {
        absoluteCss = path.isAbsolute(pathCss) ? pathCss : path.join(globalData.folderCss, pathCss);
    }

    let nameCssFile = path.basename(absoluteCss);

    if (fs.existsSync(absoluteCss)) {
        const backupPath = path.join(__dirname, 'backup', 'resurse', 'css');

        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }

        let timestamp = new Date().getTime();
        let backupFile = path.join(backupPath, `${nameCssFile}_${timestamp}`);

        try {
            fs.copyFileSync(absoluteCss, backupFile);
        } catch (err) {
            console.error(`Error when trying to backup ${nameCssFile}:`, err);
        }
    }

    try {
        const rez = sass.compile(absoluteScss);
        fs.writeFileSync(absoluteCss, rez.css);
        console.log(`[SCSS] Compiled: ${nameScssFile} -> ${nameCssFile}`);
    } catch (err) {
        console.error(`[SCSS] Compilation failde ${nameScssFile}:`, err.message);
    }
}
function initScss() {
    if (!fs.existsSync(globalData.folderScss)) fs.mkdirSync(globalData.folderScss, { recursive: true });
    if (!fs.existsSync(globalData.folderCss)) fs.mkdirSync(globalData.folderCss, { recursive: true });

    let file_ = fs.readdirSync(globalData.folderScss);
    for (let _file of file_) {
        if (_file.endsWith('.scss')) {
            ScssComp(_file);
        }
    }

    fs.watch(globalData.folderScss, (eventType, filename) => {
        if (filename && filename.endsWith('.scss')) {
            let fullPath = path.join(globalData.folderScss, filename);

            if (eventType === 'change' || eventType === 'rename') {
                if (fs.existsSync(fullPath)) {
                    console.log(`[Watch] Change detected in ${filename}. Recompiled`);
                    ScssComp(filename);
                }
            }
        }
    });
}
initScss();

// ===================================================================================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
    res.locals.userIp = req.ip;
    next();
});
app.use('/resources', (req, res, next) => {
    let hasExtension = /\.[a-zA-Z0-9]+$/.test(req.url);

    if (req.url.endsWith('/') || !hasExtension) {
        return displayError(res, 403);
    }
    next();
});
app.use('/resources', express.static(path.join(__dirname, 'resources')));


function displayError(res, identifier, title, text, image) {
    let foundError = globalData?.errorsObj?.error_info?.find(e => e.identifier == identifier);

    let currentError = foundError || globalData.errorsObj.default_error;

    let finalTitle = title || currentError.title;
    let finalText = text || currentError.text;
    let finalImage = image || currentError.image;

    let statusCode = 500;
    if (foundError && foundError.status) {
        statusCode = identifier;
    } else if (!identifier) {
        statusCode = 500;
    }

    res.status(statusCode).render('pages/error_page', {
        title: finalTitle,
        text: finalText,
        image: finalImage
    });
}

async function processGalleryData() {
    let rawdata = fs.readFileSync('gallery.json');
    let gallery = JSON.parse(rawdata);

    let curTime = new Date().getHours();
    let displTime = 'day';

    if (curTime >= 5 && curTime < 12) {
        displTime = 'morning';
    } else if (curTime >= 12 && curTime < 20) {
        displTime = 'day';
    } else {
        displTime = 'night';
    }

    let filteredImgs = gallery.images.filter(img => img.time === displTime);

    let rest = filteredImgs.length % 3;
    if (rest !== 0) {
        filteredImgs = filteredImgs.slice(0, filteredImgs.length - rest);
    }

    const galleryAbsPath = path.join(__dirname, 'resources', 'images', 'gallery');

    if (!fs.existsSync(galleryAbsPath)) {
        fs.mkdirSync(galleryAbsPath, { recursive: true });
    }

    for (let img of filteredImgs) {
        let origPath = path.join(galleryAbsPath, img.relative_path);

        if (fs.existsSync(origPath)) {
            let parsedPath = path.parse(img.relative_path);
            let nameSmall = parsedPath.name + "-small" + parsedPath.ext;
            let nameMedium = parsedPath.name + "-medium" + parsedPath.ext;

            let pathSmall = path.join(galleryAbsPath, nameSmall);
            let pathMedium = path.join(galleryAbsPath, nameMedium);

            if (!fs.existsSync(pathSmall)) {
                await sharp(origPath).resize(300).toFile(pathSmall);
            }
            if (!fs.existsSync(pathMedium)) {
                await sharp(origPath).resize(600).toFile(pathMedium);
            }
        }
    }

    return {
        images: filteredImgs,
        gallery_path: gallery.gallery_path
    };
}


app.get(['/', '/index', '/home'], async (req, res) => {
    try {
        let galleryData = await processGalleryData();

        res.render('pages/index', galleryData, function (error, renderResult) {
            if (error) {
                console.error("Home Render error:", error);
                displayError(res, 500);
            } else {
                res.send(renderResult);
            }
        });
    } catch (err) {
        console.error("Server Error in Home Route:", err);
        displayError(res, 500);
    }
});

app.get('/merchandise', async (req, res) => {
    try {
        let selectedCategory = req.query.categ;
        let sqlQuery = 'SELECT * FROM product ORDER BY id ASC';
        let queryParams = [];

        if (selectedCategory && selectedCategory !== 'all') {
            sqlQuery = 'SELECT * FROM product WHERE main_category = $1 ORDER BY id ASC';
            queryParams = [selectedCategory];
        }

        const result = await pool.query(sqlQuery, queryParams);

        res.render('pages/merchandise', {
            merchandise: result.rows
        });
    } catch (err) {
        console.error("Error loading merchandise:", err);
        displayError(res, 500);
    }
});

app.get('/guidance', async (req, res) => {
    try {
        let galleryData = await processGalleryData();

        res.render('pages/guidance', galleryData, function (error, renderResult) {
            if (error) {
                console.error("Guidance Render error:", error);
                displayError(res, 500);
            } else {
                res.send(renderResult);
            }
        });
    } catch (err) {
        console.error("Server Error in Guidance Route:", err);
        displayError(res, 500);
    }
});

app.get(/\.ejs$/, (req, res) => {
    displayError(res, 400);
});


app.get('/favicon.ico', (req, res) => {
    let faviconPath = path.join(__dirname, 'resources', 'images', 'favicon.ico');
    res.sendFile(faviconPath);
});

app.get(/.*/, (req, res) => {
    let page = req.path.substring(1);
    res.render('pages/' + page, function (error, renderResult) {
        if (error) {
            if (error.message.startsWith("Failed to lookup view")) {
                displayError(res, 404);
            } else {
                displayError(res, 500);
            }
        } else {
            res.send(renderResult);
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});