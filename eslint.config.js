// eslint.config.js
// import globals from 'globals';
// import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
// export default [
//     {
//         // Configuration for all files
//         linterOptions: {
//             reportUnusedDisableDirectives: 'error',
//         },
//         languageOptions: {
//             // Define global variables for Node.js environment
//             globals: {
//                 ...globals.node,
//                 // Add any other specific globals your project uses, e.g., for testing frameworks
//                 // jest: true,
//             },
//             // Set ECMAScript version
//             ecmaVersion: 'latest',
//             // Set source type to module for ES Modules (common in modern Node.js/TypeScript)
//             sourceType: 'module',
//         },
//         // Rules that apply to all files
//         rules: {
//             // Example: Enforce consistent indentation (adjust as needed)
//             'indent': ['error', 2],
//             // Example: Require semicolons at the end of statements
//             'semi': ['error', 'always'],
//             // Example: Prefer const over let when variable is not reassigned
//             'prefer-const': 'error',
//             // Example: No unused variables (handled by TypeScript-ESLint below as well)
//             'no-unused-vars': 'warn',
//         },
//     },
//     // Apply recommended ESLint rules
//     pluginJs.configs.recommended,

//     // Apply recommended TypeScript-ESLint rules
//     ...tseslint.configs.recommended,
//     {
//         // Specific configurations for TypeScript files
//         files: ['**/*.ts', '**/*.tsx'], // Apply these rules to .ts and .tsx files
//         languageOptions: {
//             parser: tseslint.parser, // Specify TypeScript parser
//             parserOptions: {
//                 project: './tsconfig.json', // Path to your tsconfig.json
//                 tsconfigRootDir: import.meta.dirname, // Root directory for tsconfig.json
//             },
//         },
//         rules: {
//             // TypeScript-specific rules
//             // Example: Disable 'no-unused-vars' from base ESLint, let TypeScript-ESLint handle it
//             'no-unused-vars': 'off',
//             '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
//             // Example: Enforce explicit function return types (adjust if you prefer inference)
//             '@typescript-eslint/explicit-function-return-type': 'off', // Can be 'error'
//             // Example: No explicit any types (can be strict)
//             '@typescript-eslint/no-explicit-any': 'warn',
//         },
//     },
//     // Add more configurations here as needed for specific directories or file types
//     // For example, if you have test files that need different globals or rules:
//     // {
//     //   files: ['tests/**/*.ts'],
//     //   languageOptions: {
//     //     globals: {
//     //       ...globals.jest, // If using Jest
//     //     },
//     //   },
//     //   rules: {
//     //     // Test-specific rules
//     //   },
//     // },
// ];

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
);