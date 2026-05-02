'use strict';

const assert = require('assert');
const { __testing: extensionTesting } = require('../src-js/core/extension.runtime');

function main() {
  assert.equal(
    extensionTesting.isExplicitSkillCreationGoal('qiero una skill para instalar programas en linux zorin'),
    true,
    'debe detectar solicitudes explicitas de creacion de skill',
  );

  const prioritized = extensionTesting.prioritizeResolvedSkillsForGoal(
    'qiero una skill para instalar programas en linux zorin con pocos clics',
    [{ id: 'senior-architect', category: 'development', score: 13, gh_path: '.github/skills/senior-architect/SKILL.md' }],
  );

  assert.deepStrictEqual(
    prioritized.slice(0, 3).map((item) => item.id),
    ['skill-creator', 'make-skill-template', 'senior-architect'],
    'debe priorizar skills de creacion de skills antes del resto',
  );

  const untouched = extensionTesting.prioritizeResolvedSkillsForGoal(
    'analiza este proyecto javascript',
    [{ id: 'javascript-pro', category: 'development', score: 10, gh_path: '.github/skills/javascript-pro/SKILL.md' }],
  );

  assert.deepStrictEqual(
    untouched.map((item) => item.id),
    ['javascript-pro'],
    'no debe alterar goals que no sean de creacion de skills',
  );

  console.log('extension_runtime_skill_priority_smoke: ok');
}

main();