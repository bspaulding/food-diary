# Food Diary Frontend

This is a [SolidJS](https://solidjs.com) frontend for [food-diary.motingo.com](https://food-diary.motingo.com).

## Usage

```bash
$ npm install
```

## Available Scripts

In the project directory, you can run:

### `npm run dev` or `npm start`

Runs the app in the development mode.<br>
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br>

### Using a local backend

If you are using the local backend, change the api route rewrite in `vite.config.js`:

```
 target: "http://localhost:8080/",
```

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## Deployment

See the Dockerfile. This is an nginx static site with the dist folder.
