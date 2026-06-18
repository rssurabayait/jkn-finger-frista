import globals from 'globals';

export default [
	{
		ignores: ['node_modules/**', 'logs/**', '*.log', 'index.js.bak', 'eslint.config.js']
	},
	{
		files: ['src/**/*.js', 'test/**/*.js'],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
			globals: { ...globals.node }
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-undef': 'error',
			'no-console': 'warn',
			'prefer-const': 'warn',
			'no-var': 'error',
			eqeqeq: ['error', 'smart'],
			'no-throw-literal': 'error'
		}
	}
];
