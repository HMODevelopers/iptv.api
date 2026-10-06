import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(js.configs.recommended, ...ts.configs.recommended, { files: ['**/*.ts'], languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', __dirname: 'readonly', Buffer: 'readonly' } }, rules: { '@typescript-eslint/no-explicit-any': 'error' } });
