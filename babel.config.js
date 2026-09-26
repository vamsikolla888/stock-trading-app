module.exports = function babel(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
          extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.json', '.ts', '.tsx'],
        },
      ],
      // Reanimated plugin MUST be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};
