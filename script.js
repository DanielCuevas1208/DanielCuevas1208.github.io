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
  "engineer-profile",
  "signal-garden",
  "local-first-job-queue",
  "packet-forensics-lab",
  "personal-ledger-lab",
  "shader-sketchbook",
  "DanielCuevas1208.github.io",
  "DanielCuevas1208",
  "localprofilecoder",
]);

async function loadRecentProjects() {
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
    .slice(0, 6);
  if (projects.length === 0) return;

  const shelf = document.querySelector("#github-projects");
  for (const repo of projects) {
    const article = document.createElement("article");
    article.className = "shelf-card";

    const label = document.createElement("p");
    label.className = "project-type";
    label.textContent = `${repo.language || "Software project"}${repo.topics?.includes("showcase-project") ? " / Showcase" : ""}`;

    const title = document.createElement("h3");
    title.textContent = repo.name.replaceAll("-", " ");

    const description = document.createElement("p");
    description.textContent = repo.description || "A recent software experiment.";

    const link = document.createElement("a");
    link.href = repo.html_url;
    link.textContent = "View project ->";

    article.append(label, title, description, link);
    shelf.append(article);
  }
  document.querySelector("#fresh").hidden = false;
}

loadRecentProjects().catch(() => undefined);
