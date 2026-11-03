const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    }
  },
  // Must stay last: disables ESLint stylistic rules that conflict with Prettier.
  eslintConfigPrettier
];
