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

document.querySelectorAll(".project").forEach((element) => {
  observer.observe(element);
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

const hasTopic = (repo, topic) =>
  Array.isArray(repo.topics) && repo.topics.includes(topic);

const displayName = (name) => name
  .split("-")
  .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
  .join(" ");

function renderProjects(targetId, sectionId, repositories, category) {
  if (repositories.length === 0) return;
  const shelf = document.querySelector(`#${targetId}`);
  if (!shelf) return;

  for (const repo of repositories) {
    const article = document.createElement("article");
    article.className = "shelf-card";

    const label = document.createElement("p");
    label.className = "project-type";
    label.textContent = `${repo.language || "Software project"} / ${category}`;

    const title = document.createElement("h3");
    title.textContent = displayName(repo.name);

    const description = document.createElement("p");
    description.textContent = repo.description || "A recent software experiment.";

    const link = document.createElement("a");
    link.href = repo.html_url;
    link.textContent = "View project ->";

    article.append(label, title, description, link);
    shelf.append(article);
  }

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
  const showcase = projects.filter((repo) => hasTopic(repo, "showcase-project"));
  const supporting = projects.filter((repo) =>
    !hasTopic(repo, "showcase-project") && hasTopic(repo, "supporting-project")
  );

  renderProjects("github-showcase-projects", "github-showcase", showcase, "Showcase");
  renderProjects("github-supporting-projects", "supporting", supporting, "Supporting");
}

loadPortfolioProjects().catch(() => undefined);
