module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  ignorePatterns: ['/dist/*', '/node_modules/*', '/.expo/*', '/android/*', '/ios/*'],
  rules: {
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        pathGroups: [{ pattern: '@/**', group: 'internal' }],
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'lucide-react-native',
            message:
              "Import icons one by one — `import Mail from 'lucide-react-native/icons/mail'`. Metro doesn't tree-shake, so the barrel ships every icon in the bundle and slows startup.",
          },
        ],
      },
    ],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
