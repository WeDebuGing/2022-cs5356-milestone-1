# Milestone 1 Project: Ruffhouse

Refer to the assignment for most of the details of the project

## Usage

* Run  `npm install` to install all the project dependencies
* Run `npm run start` to start the server
* Visit http://localhost:8080 in your browser to open the World Cup 2026 knockout dashboard
* Visit `/world-cup` directly to open the same dashboard route

## Development

There are TODOs scattered throughout the codebase. You can search for `CS5356 TODO` to see the items that need to be completed.

This project is __almost__ functional but missing some key elements, and some of the features won't work.

## World Cup 2026 Dashboard

The World Cup dashboard is available in two forms:

* Node/Express app: run the server and open `/` or `/world-cup`.
* GitHub Pages: publish the `docs/` folder from the `main` branch. GitHub Pages will serve
  `docs/index.html` as the public dashboard.

The dashboard uses ESPN's public FIFA World Cup scoreboard feed in real time. It does not include
mock matchups or sample scores; unresolved future bracket slots are shown exactly as placeholders
from the feed until the source updates them.

## Updates

There are likely some other bugs that I don't intend to be here, so there may be updates after
