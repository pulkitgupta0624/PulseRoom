const js = require('@eslint/js');
const globals = require('globals');

const sharedRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
      varsIgnorePattern: '^React$'
    }
  ]
};

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'frontend/build/**',
      'tmp/**'
    ]
  },
  js.configs.recommended,
  {
    files: [
      'eslint.config.js',
      'api-gateway/**/*.js',
      'packages/**/*.js',
      'scripts/**/*.js',
      'services/**/*.js',
      'frontend/*.config.js',
      'frontend/vite.config.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser
      }
    },
    rules: sharedRules
  },
  {
    files: ['frontend/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.worker
      }
    },
    rules: sharedRules
  },
  {
    files: ['**/*.test.js', '**/*.test.jsx'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    }
  }
];
