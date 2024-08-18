module.exports = {
    'env': {
        'es2021': true,
        'node': true
    },
    'extends': [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    'parser': '@typescript-eslint/parser',
    'parserOptions': {
        'ecmaVersion': 12,
        'sourceType': 'module'
    },
    'plugins': [
        '@typescript-eslint'
    ],
    'rules': {
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'error',
            'single'
        ],
        'semi': [
            'error',
            'never'
        ],
        '@typescript-eslint/no-explicit-any':
            ['warn', {
                fixToUnknown: true // This line is optional and only relevant if you are using TypeScript
            }],
        'comma-dangle': 'off',
        '@typescript-eslint/comma-dangle': 'error',
        'prefer-arrow-callback': 'error'
        // Add any other rules you want to enforce here
    }
}