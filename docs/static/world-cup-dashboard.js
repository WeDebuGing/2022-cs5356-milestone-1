const REFRESH_INTERVAL_MS = 60000;
const ESPN_SCOREBOARD_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";
const ESPN_SCOREBOARD_PAGE_URL = "https://www.espn.com/soccer/scoreboard/_/league/fifa.world";
const GROUP_STAGE_MATCH_COUNT = 72;
const ROUND_LAYOUT = [
  { key: "round-of-32", label: "Round of 32", count: 16 },
  { key: "round-of-16", label: "Round of 16", count: 8 },
  { key: "quarterfinals", label: "Quarterfinals", count: 4 },
  { key: "semifinals", label: "Semifinals", count: 2 },
  { key: "third-place", label: "Third Place", count: 1 },
  { key: "final", label: "Final", count: 1 },
];

const elements = {
  sourceName: document.getElementById("source-name"),
  lastUpdated: document.getElementById("last-updated"),
  alert: document.getElementById("feed-alert"),
  knockout: document.getElementById("stat-knockout"),
  completed: document.getElementById("stat-completed"),
  live: document.getElementById("stat-live"),
  next: document.getElementById("stat-next"),
  liveCount: document.getElementById("live-count"),
  liveMatches: document.getElementById("live-matches"),
  rounds: document.getElementById("rounds"),
  refreshButton: document.getElementById("refresh-button"),
};

elements.refreshButton.addEventListener("click", () => loadDashboard());

loadDashboard();
setInterval(loadDashboard, REFRESH_INTERVAL_MS);

async function loadDashboard() {
  setAlert("");

  try {
    renderDashboard(await fetchDashboardData());
  } catch (error) {
    setAlert(error.message || "The live scoreboard feed is unavailable right now.");
  }
}

async function fetchDashboardData() {
  if (!isStaticPage()) {
    try {
      const response = await fetch("/api/world-cup/knockout", { headers: { accept: "application/json" } });

      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      // Fall back to the public feed so the dashboard still works as static HTML.
    }
  }

  const response = await fetch(ESPN_SCOREBOARD_API_URL, { headers: { accept: "application/json" } });

  if (!response.ok) {
    throw new Error("The live scoreboard feed is unavailable right now.");
  }

  return normalizeScoreboard(await response.json(), new Date().toISOString());
}

function isStaticPage() {
  return (
    window.location.protocol === "file:" ||
    window.location.hostname.endsWith("github.io") ||
    window.location.pathname.includes("/docs/")
  );
}

function renderDashboard(data) {
  elements.sourceName.textContent = data.source.name;
  elements.lastUpdated.textContent = `Updated ${formatDateTime(data.source.refreshedAt)}`;
  elements.knockout.textContent = data.summary.knockoutMatches;
  elements.completed.textContent = data.summary.completedKnockoutMatches;
  elements.live.textContent = data.summary.liveKnockoutMatches;
  elements.next.textContent = data.summary.nextKnockoutMatch
    ? `${formatMatchTeams(data.summary.nextKnockoutMatch)} - ${formatDateTime(data.summary.nextKnockoutMatch.date)}`
    : "No upcoming knockout match in feed";

  renderLiveMatches(data.liveMatches || []);
  renderRounds(data.rounds || []);
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

  return {
    source: {
      name: "ESPN FIFA World Cup scoreboard",
      url: ESPN_SCOREBOARD_PAGE_URL,
      apiUrl: ESPN_SCOREBOARD_API_URL,
      refreshedAt,
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
      nextKnockoutMatch:
        knockoutMatches.find(match => match.status.state !== "post" && !match.status.completed) || null,
    },
    liveMatches,
    rounds,
  };
}

function buildRounds(knockoutMatches) {
  let offset = 0;

  return ROUND_LAYOUT.map(round => {
    const matches = knockoutMatches.slice(offset, offset + round.count);
    offset += round.count;

    return {
      ...round,
      matches,
      completed: matches.filter(match => match.status.completed).length,
      live: matches.filter(match => match.status.state === "in").length,
    };
  });
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

function renderLiveMatches(matches) {
  elements.liveCount.textContent = matches.length ? `${matches.length} live` : "No live matches";
  elements.liveMatches.innerHTML = "";

  if (!matches.length) {
    elements.liveMatches.appendChild(emptyState("No World Cup matches are live in the feed right now."));
    return;
  }

  matches.forEach(match => {
    const card = document.createElement("article");
    card.className = "wc-live-card";
    card.innerHTML = `
      <div class="wc-match-top">
        <span class="wc-status is-live">${escapeHtml(match.status.detail)}</span>
        <span class="wc-meta">${formatDateTime(match.date)}</span>
      </div>
      ${renderTeams(match)}
      <div class="wc-match-footer">
        <span>${escapeHtml(formatVenue(match.venue))}</span>
        <span>${escapeHtml(match.broadcast || "")}</span>
      </div>
    `;
    elements.liveMatches.appendChild(card);
  });
}

function renderRounds(rounds) {
  elements.rounds.innerHTML = "";

  if (!rounds.length) {
    elements.rounds.appendChild(emptyState("The knockout bracket is not available from the feed yet."));
    return;
  }

  rounds.forEach(round => {
    const section = document.createElement("article");
    section.className = "wc-round";
    section.innerHTML = `
      <div class="wc-round-header">
        <h3 class="wc-round-title">${escapeHtml(round.label)}</h3>
        <span class="wc-pill">${round.completed}/${round.matches.length} complete</span>
      </div>
      <div class="wc-match-grid">
        ${round.matches.map(renderMatch).join("") || `<div class="wc-empty">No matches in feed.</div>`}
      </div>
    `;
    elements.rounds.appendChild(section);
  });
}

function renderMatch(match) {
  const stateClass =
    match.status.state === "in" ? "is-live" : match.status.completed ? "is-complete" : "is-scheduled";

  return `
    <article class="wc-match ${stateClass}">
      <div class="wc-match-top">
        <span class="wc-status ${statusClass(match)}">${escapeHtml(match.status.detail)}</span>
        <span class="wc-meta">${formatDateTime(match.date)}</span>
      </div>
      ${renderTeams(match)}
      <div class="wc-match-footer">
        <span>${escapeHtml(formatVenue(match.venue))}</span>
        <span>${match.hasResolvedTeams ? "" : '<span class="wc-placeholder">Source placeholder</span>'}</span>
      </div>
    </article>
  `;
}

function renderTeams(match) {
  return match.competitors
    .map(team => {
      const crest = team.logo
        ? `<img class="wc-crest" src="${escapeAttribute(team.logo)}" alt="">`
        : '<span class="wc-crest-placeholder material-icons" aria-hidden="true">flag</span>';
      const score = team.score === "" ? "" : `<span class="wc-score">${escapeHtml(team.score)}</span>`;

      return `
        <div class="wc-team ${team.winner ? "wc-winner" : ""}">
          ${crest}
          <span class="wc-team-name">${escapeHtml(team.name)}</span>
          ${score}
        </div>
      `;
    })
    .join("");
}

function statusClass(match) {
  if (match.status.state === "in") {
    return "is-live";
  }

  if (match.status.completed) {
    return "is-complete";
  }

  return "";
}

function formatMatchTeams(match) {
  return match.competitors.map(team => team.name).join(" vs ");
}

function formatVenue(venue) {
  if (!venue) {
    return "Venue TBA";
  }

  return [venue.name, venue.city].filter(Boolean).join(", ");
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function setAlert(message) {
  elements.alert.hidden = !message;
  elements.alert.textContent = message;
}

function emptyState(message) {
  const empty = document.createElement("div");
  empty.className = "wc-empty";
  empty.textContent = message;
  return empty;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
