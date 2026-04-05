const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;


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
    errorsObj: null
};

function initErrors() {
    let errorData = JSON.parse(fs.readFileSync(path.join(__dirname, 'errors.json'), 'utf8'));

    errorData.default_error.image = `${errorData.base_path}/${errorData.default_error.image}`;

    for (let error of errorData.error_info) {
        error.image = `${errorData.base_path}/${error.image}`;
    }

    globalData.errorsObj = errorData;
}
initErrors();
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
    let foundError = globalData.errorsObj.error_info.find(e => e.identifier == identifier);

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



app.get(['/', '/index', '/home'], (req, res) => {
    res.render('pages/index', function (error, renderResult) {
        if (error) {
            displayError(res, 500);
        } else {
            res.send(renderResult);
        }
    });
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