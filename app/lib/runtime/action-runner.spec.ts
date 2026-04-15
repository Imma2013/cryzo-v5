import { describe, expect, it } from 'vitest';
import { getViteProjectRepairPlan } from './action-runner';

describe('getViteProjectRepairPlan', () => {
  it('repairs a React Vite app missing index.html and main entry', () => {
    const plan = getViteProjectRepairPlan({
      packageJsonContent: JSON.stringify({
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
        },
        devDependencies: {
          vite: '^5.4.11',
        },
      }),
      existingPaths: ['package.json', 'src/App.tsx', 'src/index.css', 'node_modules/.bin/vite'],
    });

    expect(plan.isApplicable).toBe(true);
    expect(plan.blockingIssues).toEqual([]);
    expect(plan.repairFiles.map((file) => file.path)).toEqual(['src/main.tsx', 'index.html']);
    expect(plan.repairFiles[0].content).toContain("import App from './App'");
    expect(plan.repairFiles[1].content).toContain('/src/main.tsx');
  });

  it('requests dependency installation when vite is declared but not installed', () => {
    const plan = getViteProjectRepairPlan({
      packageJsonContent: JSON.stringify({
        scripts: {
          dev: 'vite',
        },
        devDependencies: {
          vite: '^5.4.11',
        },
      }),
      existingPaths: ['package.json', 'index.html', 'src/main.jsx'],
    });

    expect(plan.shouldInstallDependencies).toBe(true);
    expect(plan.blockingIssues).toEqual([]);
  });

  it('blocks incomplete vite projects that cannot be repaired safely', () => {
    const plan = getViteProjectRepairPlan({
      packageJsonContent: JSON.stringify({
        scripts: {
          dev: 'vite',
        },
        devDependencies: {
          vite: '^5.4.11',
        },
      }),
      existingPaths: ['package.json', 'node_modules/.bin/vite'],
    });

    expect(plan.repairFiles).toEqual([]);
    expect(plan.blockingIssues).toEqual([
      'Missing app entry file (`src/main.ts`, `src/main.tsx`, `src/main.js`, or `src/main.jsx`).',
      'Missing `index.html` entry file.',
    ]);
  });

  it('does not try to repair Remix projects that happen to use remix vite commands', () => {
    const plan = getViteProjectRepairPlan({
      packageJsonContent: JSON.stringify({
        scripts: {
          dev: 'remix vite:dev',
        },
        dependencies: {
          '@remix-run/react': '^2.15.2',
        },
        devDependencies: {
          vite: '^5.4.11',
        },
      }),
      existingPaths: ['package.json'],
    });

    expect(plan.isApplicable).toBe(false);
    expect(plan.repairFiles).toEqual([]);
    expect(plan.blockingIssues).toEqual([]);
  });
});
