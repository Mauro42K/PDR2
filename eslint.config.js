import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import globals from 'globals';

const typescript = (isTSX) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: isTSX ? ['typescript', 'jsx'] : ['typescript'] },
    },
  },
});

export default [
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'node_modules/**',
      '.worktrees/**',
      '.rsc/**',
      '.claude/**',
      '02-DOCS/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
    ],
  },
  { ...js.configs.recommended, files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'] },
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: typescript(false),
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: typescript(true),
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.nodeBuiltin } },
  { files: ['**/*.cjs'], languageOptions: { globals: globals.node } },
];
