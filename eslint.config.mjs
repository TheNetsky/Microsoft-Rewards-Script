import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'diagnostics/**', 'sessions/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021
            },
            ecmaVersion: 2021,
            sourceType: 'module'
        },
        rules: {
            '@typescript-eslint/no-explicit-any': ['warn', { fixToUnknown: false }],
            'prefer-arrow-callback': 'error',
            'no-empty': 'off',
            'preserve-caught-error': 'off'
        }
    },
    // scripts/ 下用 ts-node/register 桥接 src TS 的 CJS 工具脚本
    {
        files: ['scripts/**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off'
        }
    },
    // Must come last: disables ESLint rules that conflict with Prettier formatting
    prettier
)
