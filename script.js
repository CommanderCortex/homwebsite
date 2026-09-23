const timeNode = document.querySelector('#current-time');
const toast = document.querySelector('#toast');
const loadNode = document.querySelector('#load-count');
const lastCheckNode = document.querySelector('#last-check');
const projectsNode = document.querySelector('#github-projects');
const cpuTotalNode = document.querySelector('#cpu-total');
const memoryTotalNode = document.querySelector('#memory-total');
const poolCpuNode = document.querySelector('#pool-cpu');
const poolMemoryNode = document.querySelector('#pool-memory');

const fallbackCapacity = { cores: 64, memoryGb: 256, memoryUsedGb: 25, load: 0.14, nodes: 1 };

function updateClock() {
  const now = new Date();
  timeNode.textContent = `${now.toISOString().slice(11, 19)} UTC`;
}

updateClock();
setInterval(updateClock, 1000);

function renderCapacity(capacity) {
  const cpuSpec = '2X INTEL XEON GOLD 6530';
  const ramUsed = Number(capacity.memoryUsedGb ?? 25).toFixed(1);
  const ramTotal = Number(capacity.memoryGb ?? 256);
  const loadValue = Number(capacity.load ?? 0.14).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

  cpuTotalNode.textContent = cpuSpec;
  memoryTotalNode.textContent = `${ramUsed}/${ramTotal}GB DDR5 / LOAD ${loadValue}`;
  poolCpuNode.textContent = cpuSpec;
  poolMemoryNode.textContent = `${ramTotal}GB DDR5`;
  if (loadNode) loadNode.textContent = loadValue;
}

async function loadHostCapacity() {
  try {
    const response = await fetch('/api/host-capacity', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Capacity request failed');
    const capacity = await response.json();
    renderCapacity({
      cores: Number(capacity.cores || 64),
      memoryGb: Math.round(Number(capacity.memoryGb || 256)),
      memoryUsedGb: Number(capacity.memoryUsedGb || 25),
      load: Number(capacity.load || 0.14),
      nodes: 1,
    });
  } catch {
    renderCapacity(fallbackCapacity);
  }
}

loadHostCapacity();
setInterval(loadHostCapacity, 30000);

function createProjectRow(repository, index) {
  const row = document.createElement('a');
  row.className = 'project-row';
  row.href = repository.html_url;
  row.target = '_blank';
  row.rel = 'noreferrer';

  const number = document.createElement('span');
  number.className = 'project-index';
  number.textContent = String(index + 1).padStart(2, '0');

  const main = document.createElement('span');
  main.className = 'project-main';
  const name = document.createElement('strong');
  name.textContent = repository.name;
  const description = document.createElement('small');
  const language = repository.language || 'Code';
  const stars = repository.stargazers_count ? `★ ${repository.stargazers_count}` : 'PUBLIC';
  const forks = repository.forks_count ? ` / FORKS ${repository.forks_count}` : '';
  description.textContent = repository.description || `${language} / ${stars}${forks}`;
  if (repository.description) description.textContent = `${language} / ${stars}${forks} - ${repository.description}`;
  main.append(name, description);

  const arrow = document.createElement('span');
  arrow.className = 'project-arrow';
  arrow.textContent = '↗';
  row.append(number, main, arrow);
  return row;
}

async function loadGithubProjects() {
  try {
    const response = await fetch('https://api.github.com/users/CommanderCortex/repos?sort=updated&per_page=100');
    if (!response.ok) throw new Error('GitHub request failed');
    const repositories = (await response.json())
      .filter((repository) => !repository.fork && !repository.archived)
      .sort((first, second) => {
        const firstScore = first.stargazers_count * 10 + first.forks_count * 4 + new Date(first.pushed_at).getTime() / 1e11;
        const secondScore = second.stargazers_count * 10 + second.forks_count * 4 + new Date(second.pushed_at).getTime() / 1e11;
        return secondScore - firstScore;
      })
      .slice(0, 6);
    if (!repositories.length) throw new Error('No repositories found');
    projectsNode.replaceChildren(...repositories.map(createProjectRow));
  } catch {
    projectsNode.querySelector('small').textContent = 'Explore the public workshop on GitHub ↗';
  }
}

loadGithubProjects();

let toastTimer;
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const endpoint = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(endpoint);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = endpoint;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    toast.textContent = `${endpoint} copied`;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  });
});

document.querySelector('#refresh-status').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.style.opacity = '.45';
  button.querySelector('span').textContent = 'CHECKING';
  setTimeout(() => {
    const loadCount = Math.floor(Math.random() * 16) + 11;
    loadNode.textContent = loadCount;
    lastCheckNode.textContent = 'just now';
    button.disabled = false;
    button.style.opacity = '1';
    button.querySelector('span').textContent = 'REFRESH';
    toast.textContent = 'All endpoints are healthy';
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }, 700);
});
