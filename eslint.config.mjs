import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/**', 'miniprogram_npm/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
);
