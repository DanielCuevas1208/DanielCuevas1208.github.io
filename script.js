const root = document.documentElement;

window.addEventListener("pointermove", (event) => {
  root.style.setProperty("--pointer-x", `${event.clientX}px`);
  root.style.setProperty("--pointer-y", `${event.clientY}px`);
}, { passive: true });

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.dataset.visible = "true";
      observer.unobserve(entry.target);
    }
  }
}, { threshold: 0.15 });

const observeProject = (element) => observer.observe(element);

document.querySelectorAll(".project").forEach(observeProject);

const addProjectNumber = (project, number) => {
  const visual = project.querySelector(".project-visual");
  if (!visual || visual.querySelector(".project-number")) return;
  const label = document.createElement("b");
  label.className = "project-number";
  label.textContent = String(number).padStart(2, "0");
  visual.append(label);
};

document.querySelectorAll(".work > article.project").forEach((project, index) => {
  addProjectNumber(project, index + 1);
});

const featuredProjects = new Set([
  "engineer-mcp",
  "agent-trace-workbench",
  "engineer-profile",
  "signal-garden",
  "dot-matrix-deck",
  "cinderstore",
  "DanielCuevas1208.github.io",
  "DanielCuevas1208",
  "localprofilecoder",
]);

const projectOverrides = {
  "sprout-lang": {
    language: "Go",
    description: "A small programming language with a tree-walking interpreter, a bytecode virtual machine, and file modules with imports, exports, and cycle checks.",
  },
  "gatework": {
    language: "Haskell",
    description: "An event-driven digital-logic simulator that reads plain-text netlists and writes VCD waveform files and text reports.",
  },
  "tumble-lab": {
    language: "Lua",
    description: "A deterministic 2D rigid-body simulation lab with fixed-step worlds, collision handling, record and replay, and a headless runner. Interactive presentation remains under development.",
  },
  "latch": {
    language: "Erlang",
    description: "An experimental encrypted-messaging library with X25519, AES-256-GCM, and ratchet-based message keys. Handshake authentication is planned; the current release requires a trusted transport.",
  },
  "inkline-maps": {
    language: "Kotlin",
    description: "An offline Kotlin renderer for local OpenStreetMap XML extracts. It applies a plain-text style sheet and writes PNG and SVG maps.",
  },
  "turtleyard": {
    language: "Pharo Smalltalk",
    description: "A compact Pharo Smalltalk environment for turtle graphics, live Morphic drawing, L-system expansion, and PNG export.",
  },
  "paper-orrery": {
    language: "F#",
    description: "An F# astronomy calculator that propagates bundled orbital elements, converts positions to a local horizon frame, and renders SVG sky charts.",
  },
  "rota-forge": {
    language: "Scala",
    description: "A Scala staff-rostering solver that reads staff, shifts, and rules from CSV files and writes scored schedules as CSV and HTML.",
  },
  "specimen-press": {
    language: "Swift",
    description: "A Swift font-inspection toolkit that reads TrueType tables, extracts glyph outlines and metrics, and renders SVG specimen sheets.",
  },
  "morphoscope": {
    language: "Prolog",
    description: "A SWI-Prolog morphological analyzer that applies documented English and Spanish inflection rules in analysis and generation directions.",
  },
  "clausecraft": {
    language: "OCaml",
    description: "A compact OCaml SAT solver with DIMACS input, DPLL search, unit propagation, independent model checks, and a Sudoku demo. Watched literals, clause learning, and restarts are planned.",
  },
  "gtfs-accessibility-auditor": {
    language: "TypeScript",
    description: "A TypeScript CLI that audits GTFS wheelchair data, data quality, trip coverage, and route-level accessibility gaps, then writes JSON and HTML reports.",
  },
};

const hasTopic = (repo, topic) =>
  Array.isArray(repo.topics) && repo.topics.includes(topic);

const displayName = (name) => name
  .split("-")
  .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
  .join(" ");

const graphicByRepo = {
  "dungeonwright": "map",
  "gatework": "logic",
  "sprout-lang": "terminal",
  "latch": "network",
  "driftlog": "merge",
  "stonehue": "board",
  "tumble-lab": "physics",
  "patchbay-synth": "wave",
  "personal-ledger-lab": "bars",
  "packet-forensics-lab": "packets",
  "local-first-job-queue": "queue",
  "shader-sketchbook": "shader",
};

const createGraphic = (repo) => {
  const variant = graphicByRepo[repo.name] || "network";
  const graphic = document.createElement("div");
  graphic.className = `auto-visual graphic-${variant}`;

  const languageLabel = document.createElement("strong");
  languageLabel.textContent = repo.language || "SOFTWARE";
  const marks = document.createElement("div");
  marks.className = "graphic-marks";
  for (let index = 0; index < 6; index += 1) {
    const mark = document.createElement("span");
    mark.className = `mark-${index + 1}`;
    marks.append(mark);
  }
  const caption = document.createElement("small");
  caption.textContent = "showcase project";
  graphic.append(languageLabel, marks, caption);
  return graphic;
};

function renderProjects(targetId, sectionId, repositories, category) {
  if (repositories.length === 0) return;
  const shelf = document.querySelector(`#${targetId}`);
  if (!shelf) return;

  repositories.forEach((repo, index) => {
    const showcase = category === "Showcase";
    const article = document.createElement("article");
    const palette = ["project-blue", "project-pink", "project-yellow", "project-green"][index % 4];
    article.className = showcase ? `project compact-project ${palette}` : "shelf-card";

    const label = document.createElement("p");
    label.className = "project-type";
    label.textContent = `${repo.language || "Software project"} / ${category}`;

    const title = document.createElement("h3");
    title.textContent = displayName(repo.name);

    const description = document.createElement("p");
    description.textContent = repo.description || "A recent software experiment.";

    const copy = document.createElement("div");
    copy.className = "project-copy";

    const link = document.createElement("a");
    link.href = repo.html_url;
    link.textContent = "View project ->";

    if (showcase) {
      const highlights = document.createElement("ul");
      highlights.setAttribute("aria-label", "Project details");
      for (const detail of [repo.language || "Software", "Showcase project"]) {
        const item = document.createElement("li");
        item.textContent = detail;
        highlights.append(item);
      }

      const visual = document.createElement("div");
      visual.className = "project-visual";
      visual.setAttribute("aria-hidden", "true");
      visual.append(createGraphic(repo));

      copy.append(label, title, description, highlights, link);
      article.append(copy, visual);
      addProjectNumber(article, index + 7);
      observeProject(article);
    } else {
      article.append(label, title, description, link);
    }
    shelf.append(article);
  });

  const section = document.querySelector(`#${sectionId}`);
  if (section) section.hidden = false;
}

async function loadPortfolioProjects() {
  const response = await fetch(
    "https://api.github.com/users/DanielCuevas1208/repos?sort=pushed&per_page=100",
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) return;
  const repositories = await response.json();
  const projects = repositories
    .filter((repo) =>
      !repo.fork &&
      !featuredProjects.has(repo.name) &&
      Array.isArray(repo.topics) &&
      repo.topics.includes("portfolio")
    )
    .map((repo) => ({ ...repo, ...(projectOverrides[repo.name] || {}) }));
  const showcase = projects.filter((repo) => hasTopic(repo, "showcase-project"));
  const supporting = projects.filter((repo) =>
    !hasTopic(repo, "showcase-project") && hasTopic(repo, "supporting-project")
  );

  renderProjects("github-showcase-projects", "github-showcase", showcase, "Showcase");
  renderProjects("github-supporting-projects", "supporting", supporting, "Supporting");
}

loadPortfolioProjects().catch(() => undefined);
