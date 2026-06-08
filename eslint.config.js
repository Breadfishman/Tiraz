import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `skills/` holds vendored third-party skill content — never our code to lint.
  { ignores: ['dist', 'coverage', 'node_modules', 'skills'] },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Test files may use non-null assertions on known-present fixtures.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
