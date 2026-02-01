import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

let cache = null;

const ensureLoaded = async () => {
  if (cache) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    cache = JSON.parse(raw);
  } catch (error) {
    cache = {};
  }
};

const persist = async () => {
  if (!cache) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), 'utf-8');
};

export const projectStore = {
  create: async ({ id, name, description, managerId = null, annotatorIds = [] }) => {
    await ensureLoaded();
    const project = {
      id,
      name,
      description: description || null,
      managerId,
      annotatorIds
    };
    cache[id] = project;
    await persist();
    return project;
  },
  get: async (id) => {
    await ensureLoaded();
    return cache[id] || null;
  },
  updateAccess: async (id, { managerId, annotatorIds }) => {
    await ensureLoaded();
    const project = cache[id];
    if (!project) return null;
    if (managerId !== undefined) project.managerId = managerId;
    if (annotatorIds !== undefined) project.annotatorIds = annotatorIds;
    await persist();
    return project;
  }
};
