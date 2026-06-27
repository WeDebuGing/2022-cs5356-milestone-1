const https = require("https");

const GROUP_STAGE_MATCH_COUNT = 72;
const SCOREBOARD_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";
const SCOREBOARD_PAGE_URL = "https://www.espn.com/soccer/scoreboard/_/league/fifa.world";
const CACHE_TTL_MS = 30 * 1000;

const ROUND_LAYOUT = [
  { key: "round-of-32", label: "Round of 32", count: 16 },
  { key: "round-of-16", label: "Round of 16", count: 8 },
  { key: "quarterfinals", label: "Quarterfinals", count: 4 },
  { key: "semifinals", label: "Semifinals", count: 2 },
  { key: "third-place", label: "Third Place", count: 1 },
  { key: "final", label: "Final", count: 1 },
];
const BRACKET_SOURCE_MAP = {
  "round-of-16": {
    1: [{ roundKey: "round-of-32", slotNumber: 1 }, { roundKey: "round-of-32", slotNumber: 3 }],
    2: [{ roundKey: "round-of-32", slotNumber: 2 }, { roundKey: "round-of-32", slotNumber: 5 }],
    3: [{ roundKey: "round-of-32", slotNumber: 4 }, { roundKey: "round-of-32", slotNumber: 6 }],
    4: [{ roundKey: "round-of-32", slotNumber: 7 }, { roundKey: "round-of-32", slotNumber: 8 }],
    5: [{ roundKey: "round-of-32", slotNumber: 11 }, { roundKey: "round-of-32", slotNumber: 12 }],
    6: [{ roundKey: "round-of-32", slotNumber: 9 }, { roundKey: "round-of-32", slotNumber: 10 }],
    7: [{ roundKey: "round-of-32", slotNumber: 14 }, { roundKey: "round-of-32", slotNumber: 16 }],
    8: [{ roundKey: "round-of-32", slotNumber: 13 }, { roundKey: "round-of-32", slotNumber: 15 }],
  },
  quarterfinals: {
    1: [{ roundKey: "round-of-16", slotNumber: 1 }, { roundKey: "round-of-16", slotNumber: 2 }],
    2: [{ roundKey: "round-of-16", slotNumber: 5 }, { roundKey: "round-of-16", slotNumber: 6 }],
    3: [{ roundKey: "round-of-16", slotNumber: 3 }, { roundKey: "round-of-16", slotNumber: 4 }],
    4: [{ roundKey: "round-of-16", slotNumber: 7 }, { roundKey: "round-of-16", slotNumber: 8 }],
  },
  semifinals: {
    1: [{ roundKey: "quarterfinals", slotNumber: 1 }, { roundKey: "quarterfinals", slotNumber: 2 }],
    2: [{ roundKey: "quarterfinals", slotNumber: 3 }, { roundKey: "quarterfinals", slotNumber: 4 }],
  },
  "third-place": {
    1: [{ roundKey: "semifinals", slotNumber: 1 }, { roundKey: "semifinals", slotNumber: 2 }],
  },
  final: {
    1: [{ roundKey: "semifinals", slotNumber: 1 }, { roundKey: "semifinals", slotNumber: 2 }],
  },
};

let cache = {
  fetchedAt: 0,
  payload: null,
};

async function getKnockoutDashboard() {
  const now = Date.now();

  if (cache.payload && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      ...cache.payload,
      cached: true,
    };
  }

  const scoreboard = await requestJson(SCOREBOARD_API_URL);
  const payload = normalizeScoreboard(scoreboard, new Date().toISOString());

  cache = {
    fetchedAt: now,
    payload,
  };

  return {
    ...payload,
    cached: false,
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { accept: "application/json" } }, response => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`ESPN scoreboard returned HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error("ESPN scoreboard returned invalid JSON"));
        }
      });
    });

    request.setTimeout(10000, () => {
      request.destroy(new Error("ESPN scoreboard request timed out"));
    });
    request.on("error", reject);
  });
}

function normalizeScoreboard(scoreboard, refreshedAt) {
  const allMatches = (scoreboard.events || [])
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(normalizeMatch);

  const knockoutMatches = allMatches.slice(GROUP_STAGE_MATCH_COUNT);
  const rounds = buildRounds(knockoutMatches);
  const liveMatches = allMatches.filter(match => match.status.state === "in");
  const liveKnockoutMatches = knockoutMatches.filter(match => match.status.state === "in");
  const nextKnockoutMatch =
    knockoutMatches.find(match => match.status.state !== "post" && !match.status.completed) || null;

  return {
    source: {
      name: "ESPN FIFA World Cup scoreboard",
      url: SCOREBOARD_PAGE_URL,
      apiUrl: SCOREBOARD_API_URL,
      refreshedAt,
      cacheSeconds: CACHE_TTL_MS / 1000,
    },
    tournament: {
      name: scoreboard.leagues && scoreboard.leagues[0] ? scoreboard.leagues[0].name : "FIFA World Cup",
      season: scoreboard.season ? scoreboard.season.year : 2026,
      knockoutStartsAfterMatches: GROUP_STAGE_MATCH_COUNT,
    },
    summary: {
      totalMatches: allMatches.length,
      groupMatches: Math.min(GROUP_STAGE_MATCH_COUNT, allMatches.length),
      knockoutMatches: knockoutMatches.length,
      completedKnockoutMatches: knockoutMatches.filter(match => match.status.completed).length,
      liveMatches: liveMatches.length,
      liveKnockoutMatches: liveKnockoutMatches.length,
      nextKnockoutMatch,
    },
    liveMatches,
    rounds,
  };
}

function buildRounds(knockoutMatches) {
  let offset = 0;

  return ROUND_LAYOUT.map(round => {
    const matches = knockoutMatches.slice(offset, offset + round.count).map((match, index) => ({
      ...match,
      roundKey: round.key,
      roundLabel: round.label,
      slotNumber: index + 1,
      sourceSlots: getSourceSlots(round.key, index + 1, match),
    }));
    offset += round.count;

    return {
      ...round,
      matches,
      completed: matches.filter(match => match.status.completed).length,
      live: matches.filter(match => match.status.state === "in").length,
    };
  });
}

function getSourceSlots(roundKey, slotNumber, match) {
  const parsedSlots = parseSourceSlots(match);

  if (parsedSlots.length) {
    return parsedSlots;
  }

  return BRACKET_SOURCE_MAP[roundKey] && BRACKET_SOURCE_MAP[roundKey][slotNumber]
    ? BRACKET_SOURCE_MAP[roundKey][slotNumber]
    : [];
}

function parseSourceSlots(match) {
  return match.competitors
    .map(competitor => parseSourceSlot(competitor.name))
    .filter(Boolean);
}

function parseSourceSlot(name) {
  const source = String(name || "");
  const roundOfMatch = source.match(/^Round of (32|16) (\d+) (Winner|Loser)$/i);

  if (roundOfMatch) {
    return {
      roundKey: roundOfMatch[1] === "32" ? "round-of-32" : "round-of-16",
      slotNumber: Number(roundOfMatch[2]),
    };
  }

  const quarterfinalMatch = source.match(/^Quarterfinal (\d+) (Winner|Loser)$/i);

  if (quarterfinalMatch) {
    return {
      roundKey: "quarterfinals",
      slotNumber: Number(quarterfinalMatch[1]),
    };
  }

  const semifinalMatch = source.match(/^Semifinal (\d+) (Winner|Loser)$/i);

  if (semifinalMatch) {
    return {
      roundKey: "semifinals",
      slotNumber: Number(semifinalMatch[1]),
    };
  }

  return null;
}

function normalizeMatch(event) {
  const competition = event.competitions && event.competitions[0] ? event.competitions[0] : {};
  const status = normalizeStatus(event.status || competition.status || {});
  const competitors = (competition.competitors || []).map(competitor =>
    normalizeCompetitor(competitor, status)
  );

  return {
    id: event.id,
    name: event.name,
    shortName: event.shortName,
    date: event.date,
    status,
    venue: competition.venue
      ? {
          name: competition.venue.fullName,
          city: competition.venue.address ? competition.venue.address.city : "",
          country: competition.venue.address ? competition.venue.address.country : "",
        }
      : null,
    broadcast:
      competition.broadcasts && competition.broadcasts[0] && competition.broadcasts[0].names
        ? competition.broadcasts[0].names.join(", ")
        : "",
    competitors,
    hasResolvedTeams: competitors.every(competitor => !competitor.placeholder),
  };
}

function normalizeStatus(status) {
  const type = status.type || {};

  return {
    state: type.state || "pre",
    completed: Boolean(type.completed),
    description: type.description || "Scheduled",
    detail: type.shortDetail || type.detail || type.description || "Scheduled",
    displayClock: status.displayClock || "",
  };
}

function normalizeCompetitor(competitor, status) {
  const team = competitor.team || {};
  const displayName = team.displayName || team.shortDisplayName || team.name || "TBD";
  const showScore = status.state === "in" || status.completed;

  return {
    id: team.id || competitor.id || displayName,
    name: displayName,
    abbreviation: team.abbreviation || "",
    logo: team.logo || "",
    homeAway: competitor.homeAway || "",
    score: showScore ? competitor.score : "",
    winner: status.completed ? Boolean(competitor.winner) : false,
    placeholder: isPlaceholderTeam(displayName, team.logo),
  };
}

function isPlaceholderTeam(name, logo) {
  if (logo) {
    return false;
  }

  return /(Group|Winner|Loser|Place|Round of|Quarterfinal|Semifinal)/i.test(name);
}

module.exports = {
  getKnockoutDashboard,
};
