const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

const errorData = JSON.parse(fs.readFileSync(path.join(__dirname, 'errors.json'), 'utf8'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/resources', express.static(path.join(__dirname, 'resources')));

console.log("__dirname:", __dirname);
console.log("__filename:", __filename);
console.log("process.cwd():", process.cwd());

function renderError(res, identifier) {
    let foundError = errorData.error_info.find(e => e.identifier == identifier);
    
    let data = foundError || errorData.default_error;

    let fullImagePath = `${errorData.base_path}/${data.image}`;

    let statusCode = (foundError && foundError.status) ? identifier : 200;

    res.status(statusCode).render('pages/error_page', {
        title: data.title,
        text: data.text,
        image: fullImagePath
    });
}

app.get(['/', '/index', '/home'], (req, res) => {
    res.render('pages/index', function (error, renderResult) {
        if (error) {
            console.error("Eroare la randarea paginii index:", error.message);
            renderError(res, 500); 
        } else {
            res.send(renderResult);
        }
    });
});

app.get(/.*/, (req, res) => {
    let page = req.path.substring(1);
    res.render('pages/' + page, function (error, renderResult) {
        if (error) {
            if (error.message.startsWith("Failed to lookup view")) {
                renderError(res, 404);
            } else {
                renderError(res, 500);
            }
        } else {
            res.send(renderResult);
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});