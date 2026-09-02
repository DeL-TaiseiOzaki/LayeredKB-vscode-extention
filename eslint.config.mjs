import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', 'out/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		rules: {
			curly: 'warn',
			eqeqeq: 'warn',
			'no-throw-literal': 'warn',
			semi: 'warn',
		},
	},
	{
		// Mocha's BDD/TDD globals used by the integration tests.
		files: ['src/test/**/*.ts'],
		languageOptions: {
			globals: {
				suite: 'readonly',
				test: 'readonly',
				suiteSetup: 'readonly',
				suiteTeardown: 'readonly',
				setup: 'readonly',
				teardown: 'readonly',
			},
		},
	}
);
