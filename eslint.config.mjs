import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
    {
        ignores: ['dist/**', 'node_modules/**', 'diagnostics/**', 'sessions/**']
    },

    {
        files: ['**/*.{js,cjs,mjs,ts,cts,mts}'],
        extends: [js.configs.recommended, tseslint.configs.recommended],

        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.node
            }
        },

        rules: {
            '@typescript-eslint/no-explicit-any': ['warn', { fixToUnknown: false }],
            'prefer-arrow-callback': 'error',
            'no-empty': 'error',
            'preserve-caught-error': 'off'
        }
    },

    {
        files: ['scripts/main/manualLogin.js'],
        rules: {
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },

    {
        files: ['scripts/**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off'
        }
    },

    prettier
)
