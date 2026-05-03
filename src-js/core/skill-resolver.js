'use strict';

/**
 * Skill Resolver - Adapted from Hermes Agent
 * 
 * Source: hermes-agent/agent/skill_utils.py
 * License: MIT
 * 
 * Lightweight skill metadata utilities for resolving and matching skills.
 * Handles frontmatter parsing, platform matching, and skill discovery.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Platform mapping
const PLATFORM_MAP = {
  'macos': 'darwin',
  'linux': 'linux',
  'windows': 'win32',
};

// Excluded skill directories
const EXCLUDED_SKILL_DIRS = new Set(['.git', '.github', '.hub', 'node_modules']);

/**
 * Parse YAML frontmatter from markdown string
 * Returns { frontmatter, body }
 */
function parseFrontmatter(content) {
  const frontmatter = {};
  let body = content;

  if (!content.startsWith('---')) {
    return { frontmatter, body };
  }

  const endMatch = content.slice(3).indexOf('\n---');
  if (endMatch === -1) {
    return { frontmatter, body };
  }

  const yamlContent = content.slice(3, endMatch + 3);
  body = content.slice(endMatch + 6);

  // Simple YAML parsing (key: value)
  for (const line of yamlContent.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    
    // Handle arrays [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Handle booleans
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Check if skill matches current platform
 */
function skillMatchesPlatform(frontmatter) {
  const platforms = frontmatter.platforms;
  
  if (!platforms) return true;
  if (!Array.isArray(platforms)) return true;
  
  const current = process.platform;
  
  for (const platform of platforms) {
    const normalized = String(platform).toLowerCase().trim();
    const mapped = PLATFORM_MAP[normalized] || normalized;
    if (current.startsWith(mapped)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get disabled skill names from config
 */
function getDisabledSkillNames(configPath = null) {
  if (!configPath) {
    configPath = path.join(os.homedir(), '.freejt7', 'config.yaml');
  }
  
  if (!fs.existsSync(configPath)) {
    return new Set();
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    
    const skills = frontmatter.skills;
    if (!skills || !skills.disabled) {
      return new Set();
    }
    
    const disabled = skills.disabled;
    if (Array.isArray(disabled)) {
      return new Set(disabled.map(s => String(s).toLowerCase()));
    }
    
    return new Set();
  } catch (error) {
    return new Set();
  }
}

/**
 * Discover skills in directory
 */
function discoverSkills(skillsDir) {
  const skills = [];
  
  if (!fs.existsSync(skillsDir)) {
    return skills;
  }
  
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_SKILL_DIRS.has(entry.name)) continue;
    
    const skillDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    
    if (!fs.existsSync(skillFile)) {
      // Check for README.md as fallback
      const readmeFile = path.join(skillDir, 'README.md');
      if (!fs.existsSync(readmeFile)) continue;
    }
    
    const skillPath = fs.existsSync(skillFile) ? skillFile : path.join(skillDir, 'README.md');
    
    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);
      
      // Check platform compatibility
      if (!skillMatchesPlatform(frontmatter)) {
        continue;
      }
      
      skills.push({
        id: frontmatter.id || entry.name,
        name: frontmatter.name || entry.name,
        description: frontmatter.description || '',
        category: frontmatter.category || 'general',
        platforms: frontmatter.platforms || null,
        priority: frontmatter.priority || 0,
        tags: frontmatter.tags || [],
        author: frontmatter.author || 'unknown',
        version: frontmatter.version || '1.0.0',
        dir: skillDir,
        path: skillPath,
        frontmatter,
        body: body.trim(),
      });
    } catch (error) {
      console.error(`[SkillResolver] Error reading skill ${entry.name}:`, error.message);
    }
  }
  
  return skills;
}

/**
 * Resolve skills by query
 */
function resolveSkills(query, options = {}) {
  const skillsDirs = options.skillsDirs || getDefaultSkillsDirs();
  const disabledNames = getDisabledSkillNames(options.configPath);
  
  const allSkills = [];
  
  for (const dir of skillsDirs) {
    const skills = discoverSkills(dir);
    allSkills.push(...skills);
  }
  
  // Filter by disabled names
  const enabledSkills = allSkills.filter(s => !disabledNames.has(s.id.toLowerCase()));
  
  // Score by query
  const queryLower = (query || '').toLowerCase();
  
  const scored = enabledSkills.map(skill => {
    let score = 0;
    
    // Exact ID match
    if (skill.id.toLowerCase() === queryLower) {
      score += 100;
    }
    
    // ID contains query
    if (skill.id.toLowerCase().includes(queryLower)) {
      score += 50;
    }
    
    // Name contains query
    if (skill.name.toLowerCase().includes(queryLower)) {
      score += 40;
    }
    
    // Category match
    if (skill.category.toLowerCase().includes(queryLower)) {
      score += 30;
    }
    
    // Tags match
    for (const tag of skill.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 20;
        break;
      }
    }
    
    // Description match
    if (skill.description.toLowerCase().includes(queryLower)) {
      score += 10;
    }
    
    // Body match
    if (skill.body.toLowerCase().includes(queryLower)) {
      score += 5;
    }
    
    // Add priority from frontmatter
    score += skill.priority;
    
    return { ...skill, score };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Return top N
  const limit = options.limit || 10;
  return scored.slice(0, limit);
}

/**
 * Get skill by ID
 */
function getSkillById(skillId, options = {}) {
  const skillsDirs = options.skillsDirs || getDefaultSkillsDirs();
  
  for (const dir of skillsDirs) {
    const skills = discoverSkills(dir);
    const skill = skills.find(s => s.id.toLowerCase() === skillId.toLowerCase());
    if (skill) return skill;
  }
  
  return null;
}

/**
 * Get default skills directories
 */
function getDefaultSkillsDirs() {
  const dirs = [];
  
  // Workspace skills
  const workspaceSkills = path.join(process.cwd(), '.github', 'skills');
  if (fs.existsSync(workspaceSkills)) {
    dirs.push(workspaceSkills);
  }
  
  // Hermes skills (imported)
  const hermesSkills = path.join(process.cwd(), '.github', 'skills', 'hermes');
  if (fs.existsSync(hermesSkills)) {
    // Add each category as a skills dir
    const categories = fs.readdirSync(hermesSkills, { withFileTypes: true });
    for (const cat of categories) {
      if (cat.isDirectory() && !EXCLUDED_SKILL_DIRS.has(cat.name)) {
        dirs.push(path.join(hermesSkills, cat.name));
      }
    }
  }
  
  // User skills
  const userSkills = path.join(os.homedir(), '.freejt7', 'skills');
  if (fs.existsSync(userSkills)) {
    dirs.push(userSkills);
  }
  
  return dirs;
}

/**
 * List all available skills
 */
function listAllSkills(options = {}) {
  const skillsDirs = options.skillsDirs || getDefaultSkillsDirs();
  const disabledNames = getDisabledSkillNames(options.configPath);
  
  const allSkills = [];
  const seen = new Set();
  
  for (const dir of skillsDirs) {
    const skills = discoverSkills(dir);
    
    for (const skill of skills) {
      const key = skill.id.toLowerCase();
      if (seen.has(key)) continue;
      
      seen.add(key);
      skill.disabled = disabledNames.has(key);
      allSkills.push(skill);
    }
  }
  
  // Sort by category, then name
  allSkills.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });
  
  return allSkills;
}

module.exports = {
  parseFrontmatter,
  skillMatchesPlatform,
  getDisabledSkillNames,
  discoverSkills,
  resolveSkills,
  getSkillById,
  listAllSkills,
  getDefaultSkillsDirs,
  PLATFORM_MAP,
  EXCLUDED_SKILL_DIRS,
};
