const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 8080;

// CS5356 TODO #2
// Uncomment this next line after you've created
// serviceAccountKey.json
const userFeed = require("./app/user-feed");
const authMiddleware = require("./app/auth-middleware");
const worldCupService = require("./app/world-cup-service");

// CS5356 TODO #2
// Uncomment this next block after you've created serviceAccountKey.json
const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.warn("Firebase service account not found; authenticated routes are disabled.");
}

// use cookies
app.use(cookieParser());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
// set the view engine to ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/static", express.static("static/"));

// use res.render to load up an ejs view file
// index page
app.get("/", function (req, res) {
  res.redirect("/world-cup");
});

app.get("/sign-in", function (req, res) {
  res.render("pages/sign-in");
});

app.get("/sign-up", function (req, res) {
  res.render("pages/sign-up");
});

app.get("/dashboard", authMiddleware, async function (req, res) {
  const feed = await userFeed.get();
  res.render("pages/dashboard", { user: req.user, feed });
});

app.get("/world-cup", function (req, res) {
  res.render("pages/world-cup");
});

app.get("/api/world-cup/knockout", async function (req, res) {
  try {
    const dashboard = await worldCupService.getKnockoutDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "Unable to load the ESPN FIFA World Cup scoreboard feed.",
    });
  }
});

app.post("/sessionLogin", async (req, res) => {
  if (!admin.apps.length) {
    res.status(503).send("Authentication is not configured.");
    return;
  }

  // CS5356 TODO #4
  // Get the ID token from the request body
  // Create a session cookie using the Firebase Admin SDK
  // Set that cookie with the name 'session'
  // And then return a 200 status code instead of a 501
  const idToken = req.body.idToken;

  const expiresIn = 60 * 60 * 24 * 5 * 1000;

  admin
    .auth()
    .createSessionCookie(idToken, { expiresIn })
    .then(
      sessionCookie => {
        const options = { maxAge: expiresIn, httpOnly: true};
        res.cookie("session", sessionCookie, options);
        res.status(200).send(JSON.stringify({ status : "success"}));
      },
      error => {
        res.status(401).send("UNAUTHORIZED REQUEST!");
      }
    ) 
});

app.get("/sessionLogout", (req, res) => {
  res.clearCookie("session");
  res.redirect("/sign-in");
});

app.post("/dog-messages", authMiddleware, async (req, res) => {
  // CS5356 TODO #5
  // Get the message that was submitted from the request body
  // Get the user object from the request body
  // Add the message to the userFeed so its associated with the user
  try {
    const dogMessage = req.body;

    await userFeed .add(req.user, dogMessage.message);
    res.redirect("./dashboard");
  } catch (err) {
    res.status(500).end({message : err});
  }
});

// equivalent (async-await-try-catch <-> then-catch)
// const dogMessage = req.body;


app.listen(port);
console.log("Server started at http://localhost:" + port);



// // Firebase initialization
// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyDT3lkF3PrL1PeykpouOdi_cq7bjUh_lBk",
//   authDomain: "csc5356-milestone1.firebaseapp.com",
//   projectId: "csc5356-milestone1",
//   storageBucket: "csc5356-milestone1.appspot.com",
//   messagingSenderId: "78775062001",
//   appId: "1:78775062001:web:01a3609e445269540d0850",
//   measurementId: "G-CSWH6QJ65W"
// };

// // Initialize Firebase
// const firebase_app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(firebase_app);
